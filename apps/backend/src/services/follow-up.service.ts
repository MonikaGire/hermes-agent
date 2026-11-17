import { prisma } from '@hermes/database';
import { ConversationReplyAgent } from '@hermes/agents';
import type { ReplyIntentResult, ServiceMode } from '@hermes/shared';
import { logActivity } from './activity.service.js';
import { logger } from '../config/logger.js';

export interface DueFollowUp {
  status: string;
  followUpAt: Date | null;
  intent: string | null;
  suppressedAt?: Date | null;
}

export function isPermittedDueFollowUp(item: DueFollowUp, now = new Date()): boolean {
  return item.status === 'FOLLOW_UP_SCHEDULED' &&
    item.intent === 'NOT_NOW' &&
    !item.suppressedAt &&
    item.followUpAt instanceof Date &&
    !Number.isNaN(item.followUpAt.getTime()) &&
    item.followUpAt.getTime() <= now.getTime();
}

/**
 * Draft ONLY. Never sends email. The status transition acts as an atomic
 * claim against duplicate Cron/BullMQ jobs; draft records also guard retries.
 */
export async function prepareScheduledFollowUp(conversationId: string): Promise<'drafted' | 'skipped'> {
  const now = new Date();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      email: { include: { contact: true, company: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!conversation || !isPermittedDueFollowUp(conversation, now)) return 'skipped';

  // Only a prospect's affirmative "try again later" response creates permission
  // for this follow-up. It is not a general no-response drip campaign.
  const inbound = conversation.messages.filter((m) => m.direction === 'INBOUND').at(-1);
  if (!inbound || inbound.intent !== 'NOT_NOW') {
    logger.warn('Due follow-up lacks a documented NOT_NOW inbound message', { conversationId });
    return 'skipped';
  }

  const claimed = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      status: 'FOLLOW_UP_SCHEDULED',
      intent: 'NOT_NOW',
      suppressedAt: null,
      followUpAt: { lte: now },
    },
    data: { status: 'FOLLOW_UP_PREPARING' },
  });
  if (claimed.count !== 1) return 'skipped';

  try {
    // Crash/retry recovery: do not generate a second draft if one already exists.
    const existingDrafts = await prisma.conversationMessage.findMany({
      where: { conversationId, direction: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });
    const outstanding = existingDrafts.find((m) => !m.sentAt && !m.approvedAt);
    if (outstanding) {
      await prisma.conversation.updateMany({
        where: { id: conversationId, status: 'FOLLOW_UP_PREPARING' },
        data: { status: 'DRAFT_READY', followUpAt: null },
      });
      return 'skipped';
    }

    const mode = conversation.email.serviceMode.toLowerCase() as ServiceMode;
    let researchSummary = '';
    if (mode === 'aeo') {
      const research = await prisma.aEOResearch.findFirst({
        where: { companyId: conversation.companyId }, orderBy: { createdAt: 'desc' },
      });
      researchSummary = research?.summary ?? '';
    } else {
      const research = await prisma.research.findFirst({
        where: { companyId: conversation.companyId }, orderBy: { createdAt: 'desc' },
      });
      researchSummary = research?.summary ?? '';
    }

    const intentDetails = (inbound.intentDetails as unknown as ReplyIntentResult | null) ?? {
      intent: 'NOT_NOW',
      confidence: 0.7,
      summary: conversation.followUpNote ?? 'The prospect invited a later follow-up.',
      suggestedAction: 'Draft a short, polite check-in for review.',
    };

    const draft = await new ConversationReplyAgent().run({
      companyName: conversation.email.company.name,
      contactName: [conversation.email.contact?.firstName, conversation.email.contact?.lastName].filter(Boolean).join(' '),
      contactRole: conversation.email.contact?.role ?? 'Unknown',
      serviceMode: mode,
      originalEmail: { subject: conversation.email.subject, body: conversation.email.body },
      thread: conversation.messages
        .filter((m) => m.direction === 'INBOUND' || m.direction === 'OUTBOUND')
        .map((m) => ({
          direction: m.direction.toLowerCase() as 'inbound' | 'outbound',
          body: m.body,
          sentAt: m.createdAt.toISOString(),
        })),
      researchSummary,
      draftPurpose: 'scheduled_follow_up',
      followUpReason: conversation.followUpNote ?? intentDetails.summary,
      intent: 'NOT_NOW',
      intentDetails,
    });

    if (!draft.success || !draft.data?.body?.trim()) {
      throw new Error('Follow-up draft generation failed: ' + (draft.error ?? 'empty draft'));
    }

    // A new reply/suppression can race with the LLM. Never store a follow-up
    // if the conversation is no longer in the claimed state.
    const current = await prisma.conversation.findUnique({
      where: { id: conversationId }, select: { status: true },
    });
    if (current?.status !== 'FOLLOW_UP_PREPARING') return 'skipped';

    await prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'DRAFT',
        subject: draft.data.subject || 'Re: ' + conversation.email.subject,
        body: draft.data.body,
      },
    });
    await prisma.conversation.updateMany({
      where: { id: conversationId, status: 'FOLLOW_UP_PREPARING' },
      data: { status: 'DRAFT_READY', followUpAt: null },
    });

    await logActivity({
      type: 'conversation.follow_up_draft_ready',
      entityType: 'conversation', entityId: conversationId,
      companyId: conversation.companyId,
      meta: { reason: conversation.followUpNote ?? '', sent: false },
    });
    return 'drafted';
  } catch (err) {
    // If draft exists, recovery should surface it rather than send/recreate it.
    await prisma.conversation.updateMany({
      where: { id: conversationId, status: 'FOLLOW_UP_PREPARING' },
      data: { status: 'FOLLOW_UP_SCHEDULED', followUpAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    throw err;
  }
}

/** Recover interrupted drafts without creating a new message or sending mail. */
export async function repairAbandonedFollowUps(): Promise<void> {
  const stale = await prisma.conversation.findMany({
    where: {
      status: 'FOLLOW_UP_PREPARING',
      updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    take: 20,
  });
  for (const conversation of stale) {
    const drafts = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id, direction: 'DRAFT' },
      orderBy: { createdAt: 'desc' }, take: 5,
    });
    const hasDraft = drafts.some((m) => !m.approvedAt && !m.sentAt);
    await prisma.conversation.updateMany({
      where: { id: conversation.id, status: 'FOLLOW_UP_PREPARING' },
      data: hasDraft
        ? { status: 'DRAFT_READY', followUpAt: null }
        : { status: 'FOLLOW_UP_SCHEDULED', followUpAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    logger.warn('Reconciled abandoned follow-up preparation', { conversationId: conversation.id, hasDraft });
  }
}
