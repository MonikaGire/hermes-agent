import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { prisma } from '@hermes/database';
import type { Prisma } from '@hermes/database';
import { logger } from '../config/logger.js';
import { GmailInboxService } from '../integrations/gmail-inbox.service.js';
import { logActivity } from '../services/activity.service.js';

export interface ReplyProcessingJobData {
  conversationId?: string;
  forceCheck?: boolean;
}

interface ProcessedReply {
  conversationId: string;
  gmailMessageId: string;
  intent: string;
  draftReady: boolean;
}

/**
 * Worker that processes incoming email replies.
 * 1. Detects new Gmail replies since last poll
 * 2. Matches them to existing conversation threads
 * 3. Runs intent classification
 * 4. Generates a draft reply
 * 5. Marks conversation for human review
 */
export function createReplyProcessingWorker(): Worker {
  const connection = getBullMQConnection();

  const worker = new Worker<ReplyProcessingJobData, ProcessedReply[]>(
    'reply-processing',
    async (job: Job<ReplyProcessingJobData>) => {
      logger.info('Reply processing job started', { jobId: job.id });
      const results: ProcessedReply[] = [];

      const gmail = new GmailInboxService();

      // Find the last time we polled Gmail
      const lastPollSetting = await prisma.setting.findUnique({ where: { key: 'gmailLastPollAt' } });
      const lastPollAt = lastPollSetting?.value
        ? new Date(lastPollSetting.value as string)
        : new Date(Date.now() - 60 * 60 * 1000); // default: 1 hour ago

      const newReplies = await gmail.fetchNewReplies(lastPollAt);
      logger.info('Gmail replies fetched', { count: newReplies.length });

      for (const reply of newReplies) {
        try {
          const result = await processOneReply(reply, gmail);
          if (result) results.push(result);
        } catch (err) {
          logger.error('Reply processing failed for message', { gmailId: reply.id, error: err });
        }
      }

      // Update last poll timestamp
      await prisma.setting.upsert({
        where: { key: 'gmailLastPollAt' },
        update: { value: new Date().toISOString() },
        create: { key: 'gmailLastPollAt', value: new Date().toISOString() },
      });

      logger.info('Reply processing complete', { processed: results.length });
      return results;
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  worker.on('completed', (job) => {
    logger.info('Reply processing job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Reply processing job failed', { jobId: job?.id, error: err });
  });

  return worker;
}

async function processOneReply(
  reply: { id: string; threadId: string; subject: string; from: string; to: string; body: string; receivedAt: Date; inReplyTo?: string },
  gmail: GmailInboxService,
): Promise<ProcessedReply | null> {
  // 1. Find matching conversation by threadId or by matching the from-email to a sent email contact
  let conversation = await prisma.conversation.findFirst({
    where: { gmailThreadId: reply.threadId },
    include: {
      email: { include: { contact: true, company: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  // If no thread ID match, try matching by contact email
  if (!conversation) {
    const fromEmail = extractEmail(reply.from);
    const matchingEmail = await prisma.email.findFirst({
      where: {
        status: 'SENT',
        contact: { email: fromEmail },
      },
      include: { contact: true, company: true },
      orderBy: { sentAt: 'desc' },
    });

    if (matchingEmail) {
      conversation = await prisma.conversation.findUnique({
        where: { emailId: matchingEmail.id },
        include: {
          email: { include: { contact: true, company: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });

      // Attach the thread ID now that we know it
      if (conversation && !conversation.gmailThreadId) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { gmailThreadId: reply.threadId },
        });
        await prisma.email.update({
          where: { id: matchingEmail.id },
          data: { gmailThreadId: reply.threadId },
        });
      }
    }
  }

  if (!conversation) {
    logger.debug('No matching conversation for Gmail message', { gmailId: reply.id, from: reply.from });
    return null;
  }

  // 2. Check for duplicate (already stored this gmailMessageId)
  const existing = await prisma.conversationMessage.findFirst({
    where: { gmailMessageId: reply.id },
  });
  if (existing) {
    logger.debug('Reply already processed', { gmailId: reply.id });
    return null;
  }

  // 3. Classify intent
  const { ReplyIntentAgent } = await import('@hermes/agents');
  const intentAgent = new ReplyIntentAgent();

  const originalEmail = conversation.email;
  const previousMessages = conversation.messages.map((m) => ({
    direction: m.direction.toLowerCase(),
    body: m.body,
  }));

  const intentResult = await intentAgent.run({
    inboundEmailBody: reply.body,
    conversationContext: {
      companyName: originalEmail.company.name,
      contactName: `${originalEmail.contact?.firstName ?? ''} ${originalEmail.contact?.lastName ?? ''}`.trim(),
      serviceMode: originalEmail.serviceMode?.toLowerCase() ?? 'erp',
      originalSubject: originalEmail.subject,
      previousMessages,
    },
  });

  const intent = intentResult.data?.intent ?? 'UNCLEAR';
  const intentDetails = intentResult.data ?? {
    intent: 'UNCLEAR',
    confidence: 0,
    summary: reply.body.slice(0, 100),
    suggestedAction: 'Review manually',
  };

  // 4. Store the inbound message
  await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      subject: reply.subject,
      body: reply.body,
      fromEmail: reply.from,
      toEmail: reply.to,
      gmailMessageId: reply.id,
      intent,
      intentDetails: intentDetails as unknown as Prisma.InputJsonValue,
    },
  });

  // 5. Handle suppression immediately
  if (intent === 'UNSUBSCRIBE' || intent === 'NEGATIVE') {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'SUPPRESSED',
        intent,
        lastMessageAt: reply.receivedAt,
        suppressedAt: new Date(),
      },
    });

    // Mark contact as suppressed
    if (originalEmail.contactId) {
      await prisma.contact.update({
        where: { id: originalEmail.contactId },
        data: { isVerified: false },
      });
    }

    await logActivity({
      type: 'conversation.suppressed',
      entityType: 'conversation',
      entityId: conversation.id,
      companyId: conversation.companyId,
      meta: { intent, reason: intentDetails.summary },
    });

    await gmail.markAsRead(reply.id);
    logger.info('Conversation suppressed', { conversationId: conversation.id, intent });
    return { conversationId: conversation.id, gmailMessageId: reply.id, intent, draftReady: false };
  }

  // 6. Handle NOT_NOW — schedule follow-up
  if (intent === 'NOT_NOW' && intentDetails.followUpAt) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'FOLLOW_UP_SCHEDULED',
        intent,
        lastMessageAt: reply.receivedAt,
        followUpAt: new Date(intentDetails.followUpAt),
        followUpNote: intentDetails.summary,
      },
    });
    await logActivity({
      type: 'conversation.follow_up_scheduled',
      entityType: 'conversation',
      entityId: conversation.id,
      companyId: conversation.companyId,
      meta: { followUpAt: intentDetails.followUpAt, reason: intentDetails.summary },
    });
    await gmail.markAsRead(reply.id);
    return { conversationId: conversation.id, gmailMessageId: reply.id, intent, draftReady: false };
  }

  // 7. Generate a draft reply for all other intents
  const { ConversationReplyAgent } = await import('@hermes/agents');
  const replyAgent = new ConversationReplyAgent();

  // Get AEO or ERP research summary
  let researchSummary = 'No research available';
  let primaryOpportunity: string | undefined;

  if (originalEmail.serviceMode === 'AEO') {
    const aeoResearch = await prisma.aEOResearch.findFirst({
      where: { companyId: conversation.companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (aeoResearch) {
      researchSummary = aeoResearch.summary;
      primaryOpportunity = aeoResearch.primaryOpportunity ?? undefined;
    }
  } else {
    const research = await prisma.research.findFirst({
      where: { companyId: conversation.companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (research) researchSummary = research.summary;
  }

  const threadMessages = conversation.messages
    .concat([{
      id: 'temp',
      conversationId: conversation.id,
      direction: 'INBOUND' as const,
      subject: reply.subject,
      body: reply.body,
      fromEmail: reply.from,
      toEmail: reply.to,
      gmailMessageId: reply.id,
      intent,
      intentDetails: null,
      draftBody: null,
      approvedAt: null,
      sentAt: null,
      createdAt: reply.receivedAt,
    }])
    .map((m) => ({
      direction: m.direction.toLowerCase() as 'outbound' | 'inbound',
      body: m.body,
      sentAt: m.createdAt.toISOString(),
    }));

  const draftResult = await replyAgent.run({
    companyName: originalEmail.company.name,
    contactName: `${originalEmail.contact?.firstName ?? ''} ${originalEmail.contact?.lastName ?? ''}`.trim(),
    contactRole: originalEmail.contact?.role ?? 'Decision Maker',
    serviceMode: (originalEmail.serviceMode?.toLowerCase() ?? 'erp') as 'erp' | 'aeo' | 'seo',
    originalEmail: { subject: originalEmail.subject, body: originalEmail.body },
    thread: threadMessages,
    researchSummary,
    primaryOpportunity,
    intent: intent as import('@hermes/shared').ReplyIntent,
    intentDetails: intentDetails as import('@hermes/shared').ReplyIntentResult,
  });

  const draftBody = draftResult.data?.body ?? null;

  // 8. Store draft and update conversation status
  if (draftBody) {
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'DRAFT',
        subject: draftResult.data?.subject ?? `Re: ${originalEmail.subject}`,
        body: draftBody,
      },
    });
  }

  const nextStatus = draftBody ? 'DRAFT_READY' : 'REPLIED';

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: nextStatus,
      intent,
      lastMessageAt: reply.receivedAt,
    },
  });

  await logActivity({
    type: 'conversation.replied',
    entityType: 'conversation',
    entityId: conversation.id,
    companyId: conversation.companyId,
    meta: { intent, intentSummary: intentDetails.summary, draftReady: !!draftBody },
  });

  await prisma.company.update({
    where: { id: conversation.companyId },
    data: { status: 'REPLIED' },
  });

  await gmail.markAsRead(reply.id);
  logger.info('Reply processed and draft ready', { conversationId: conversation.id, intent });

  return {
    conversationId: conversation.id,
    gmailMessageId: reply.id,
    intent,
    draftReady: !!draftBody,
  };
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1]! : from.trim();
}
