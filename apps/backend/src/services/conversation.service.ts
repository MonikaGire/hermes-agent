import { prisma } from '@hermes/database';
import type { Prisma, ConversationStatus } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { GmailInboxService } from '../integrations/gmail-inbox.service.js';
import { logActivity } from './activity.service.js';
import { assertCompanyNotSuppressed } from './suppression.service.js';
import { inboxPollWindow } from '../jobs/reply-poll-policy.js';
import { plainTextToSafeHtml } from '../utils/email-content.js';

export class ConversationService {
  private readonly gmail = new GmailInboxService();

  async list(opts: { page: number; limit: number; status?: string; intent?: string }) {
    const { page, limit, status, intent } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status: status as ConversationStatus } : {}),
      ...(intent ? { intent } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          company: { select: { id: true, name: true, industry: true, serviceMode: true } },
          email: {
            select: {
              id: true,
              subject: true,
              serviceMode: true,
              contact: { select: { firstName: true, lastName: true, role: true, email: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return { data, total };
  }

  async getById(id: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        company: true,
        email: { include: { contact: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) throw new AppError('Conversation not found', 404);
    return conversation;
  }

  async getDraftForConversation(conversationId: string) {
    // Fetch all draft-direction messages and filter in JS for unsent ones
    // (MongoDB null field matching via Prisma can be inconsistent)
    const drafts = await prisma.conversationMessage.findMany({
      where: { conversationId, direction: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });
    return drafts.find((d) => !d.sentAt && !d.approvedAt) ?? null;
  }

  async approveDraft(conversationId: string, messageId: string, editedBody?: string) {
    const conversation = await this.getById(conversationId);
    await assertCompanyNotSuppressed(conversation.companyId);

    const draft = await prisma.conversationMessage.findUnique({ where: { id: messageId } });
    if (!draft || draft.conversationId !== conversationId ||
      draft.direction !== 'DRAFT' || draft.sentAt || draft.approvedAt) {
      throw new AppError('No pending, unsent draft with this ID', 400);
    }

    const bodyToSend = (editedBody ?? draft.body).trim();
    if (!bodyToSend) throw new AppError('Reply body cannot be empty', 400);
    const contact = conversation.email.contact;
    if (!contact?.email) throw new AppError('Contact email not found', 400);

    // Single sender claims the draft. On an ambiguous provider/network failure,
    // keep REPLY_SENDING for human reconciliation rather than automatically
    // retrying: email delivery is not safely idempotent.
    const claim = await prisma.conversation.updateMany({
      where: { id: conversationId, status: 'DRAFT_READY' },
      data: { status: 'REPLY_SENDING' },
    });
    if (claim.count !== 1) {
      throw new AppError('Reply is not ready or is already being sent; review its status first', 409);
    }

    let gmailResult: { gmailMessageId: string; gmailThreadId: string } | null = null;
    try {
      if (conversation.gmailThreadId) {
        const lastInbound = conversation.messages
          .filter((m) => m.direction === 'INBOUND').at(-1);
        const rfcId = lastInbound?.rfcMessageId ||
          (lastInbound?.gmailMessageId
            ? await this.gmail.getRfcMessageId(lastInbound.gmailMessageId)
            : null) ||
          conversation.email.messageId;
        if (!rfcId || !/^<[^<>\r\n]+@[^<>\r\n]+>$/.test(rfcId.trim())) {
          throw new AppError('Cannot thread this reply without a valid RFC Message-ID. Resolve it before sending.', 409);
        }

        gmailResult = await this.gmail.sendReply({
          to: contact.email,
          subject: draft.subject ?? 'Re: ' + conversation.email.subject,
          body: bodyToSend,
          threadId: conversation.gmailThreadId,
          inReplyTo: rfcId.trim(),
        });
        if (!gmailResult) {
          throw new AppError('Gmail send was not confirmed. Check the Sent folder before retrying manually; SMTP fallback disabled.', 502);
        }
      } else {
        const { EmailSenderService } = await import('../integrations/email-sender.service.js');
        const sender = new EmailSenderService();
        await sender.send({
          to: contact.email,
          subject: draft.subject ?? 'Re: ' + conversation.email.subject,
          html: plainTextToSafeHtml(bodyToSend),
          text: bodyToSend,
          ...(conversation.email.messageId && {
            inReplyTo: conversation.email.messageId,
            references: conversation.email.messageId,
          }),
        });
      }

      await prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          body: bodyToSend,
          approvedAt: new Date(),
          sentAt: new Date(),
          gmailMessageId: gmailResult?.gmailMessageId ?? null,
        },
      });
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          subject: draft.subject ?? 'Re: ' + conversation.email.subject,
          body: bodyToSend,
          toEmail: contact.email,
          sentAt: new Date(),
          gmailMessageId: gmailResult?.gmailMessageId ?? null,
        },
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'REPLY_SENT', lastMessageAt: new Date() },
      });
      await logActivity({
        type: 'conversation.reply_sent',
        entityType: 'conversation', entityId: conversationId,
        companyId: conversation.companyId,
      });
      return { success: true };
    } catch (error) {
      // Never silently send a second copy over a different provider.
      await logActivity({
        type: 'conversation.reply_send_needs_reconciliation',
        entityType: 'conversation', entityId: conversationId,
        companyId: conversation.companyId,
        meta: { messageId, detail: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async discardDraft(conversationId: string, messageId: string) {
    const draft = await prisma.conversationMessage.findUnique({ where: { id: messageId } });
    if (!draft || draft.conversationId !== conversationId) {
      throw new AppError('Draft not found', 404);
    }
    await prisma.conversationMessage.delete({ where: { id: messageId } });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'REPLIED' },
    });
    return { success: true };
  }

  async regenerateDraft(conversationId: string) {
    const conversation = await this.getById(conversationId);
    if (conversation.status === 'SUPPRESSED') throw new AppError('Cannot draft for a suppressed conversation', 400);

    // Delete existing draft
    await prisma.conversationMessage.deleteMany({
      where: { conversationId, direction: 'DRAFT', sentAt: null },
    });

    // Find last inbound message and re-run reply pipeline
    const lastInbound = conversation.messages
      .filter((m) => m.direction === 'INBOUND')
      .at(-1);

    if (!lastInbound) throw new AppError('No inbound messages to reply to', 400);

    const { ReplyIntentAgent, ConversationReplyAgent } = await import('@hermes/agents');
    const intentAgent = new ReplyIntentAgent();

    const intentResult = await intentAgent.run({
      inboundEmailBody: lastInbound.body,
      conversationContext: {
        companyName: conversation.company.name,
        contactName: `${conversation.email.contact?.firstName ?? ''} ${conversation.email.contact?.lastName ?? ''}`.trim(),
        serviceMode: conversation.email.serviceMode?.toLowerCase() ?? 'erp',
        originalSubject: conversation.email.subject,
        previousMessages: conversation.messages.map((m) => ({
          direction: m.direction.toLowerCase(),
          body: m.body,
        })),
      },
    });

    const intent = intentResult.data?.intent ?? 'UNCLEAR';
    const intentDetails = intentResult.data!;

    const replyAgent = new ConversationReplyAgent();
    let researchSummary = 'No research available';
    let primaryOpportunity: string | undefined;

    if (conversation.email.serviceMode === 'AEO') {
      const aeoR = await prisma.aEOResearch.findFirst({
        where: { companyId: conversation.companyId },
        orderBy: { createdAt: 'desc' },
      });
      if (aeoR) {
        researchSummary = aeoR.summary;
        primaryOpportunity = aeoR.primaryOpportunity ?? undefined;
      }
    } else {
      const r = await prisma.research.findFirst({
        where: { companyId: conversation.companyId },
        orderBy: { createdAt: 'desc' },
      });
      if (r) researchSummary = r.summary;
    }

    const draftResult = await replyAgent.run({
      companyName: conversation.company.name,
      contactName: `${conversation.email.contact?.firstName ?? ''} ${conversation.email.contact?.lastName ?? ''}`.trim(),
      contactRole: conversation.email.contact?.role ?? 'Decision Maker',
      serviceMode: (conversation.email.serviceMode?.toLowerCase() ?? 'erp') as 'erp' | 'aeo' | 'seo',
      originalEmail: { subject: conversation.email.subject, body: conversation.email.body ?? '' },
      thread: conversation.messages.map((m) => ({
        direction: m.direction.toLowerCase() as 'outbound' | 'inbound',
        body: m.body,
        sentAt: m.createdAt.toISOString(),
      })),
      researchSummary,
      primaryOpportunity,
      intent: intent as import('@hermes/shared').ReplyIntent,
      intentDetails: intentDetails as import('@hermes/shared').ReplyIntentResult,
    });

    if (!draftResult.data) throw new AppError('Draft regeneration failed', 500);

    const newDraft = await prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'DRAFT',
        subject: draftResult.data.subject,
        body: draftResult.data.body,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'DRAFT_READY' },
    });

    return newDraft;
  }

  async pollGmail() {
    const lastPollSetting = await prisma.setting.findUnique({ where: { key: 'gmailLastPollAt' } });
    const lastPollAt = lastPollSetting?.value
      ? new Date(lastPollSetting.value as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // default: 24 hours ago

    const newReplies = await this.gmail.fetchNewReplies(lastPollAt);

    const results: { conversationId: string; gmailMessageId: string; intent: string; draftReady: boolean }[] = [];

    for (const reply of newReplies) {
      try {
        const result = await this.processOneReply(reply);
        if (result) results.push(result);
      } catch (err) {
        console.error('Reply processing failed:', err);
      }
    }

    await prisma.setting.upsert({
      where: { key: 'gmailLastPollAt' },
      update: { value: new Date().toISOString() },
      create: { key: 'gmailLastPollAt', value: new Date().toISOString() },
    });

    return { fetched: newReplies.length, processed: results.length, results };
  }

  private async processOneReply(reply: {
    id: string; threadId: string; subject: string; from: string; to: string;
    body: string; receivedAt: Date; inReplyTo?: string;
  }) {
    // Match conversation by threadId first, then by contact email
    let conversation = await prisma.conversation.findFirst({
      where: { gmailThreadId: reply.threadId },
      include: { email: { include: { contact: true, company: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!conversation) {
      const fromEmail = reply.from.match(/<([^>]+)>/)?.[1] ?? reply.from.trim();
      const matchingEmail = await prisma.email.findFirst({
        where: { status: 'SENT', contact: { email: fromEmail } },
        include: { contact: true, company: true },
        orderBy: { sentAt: 'desc' },
      });

      if (matchingEmail) {
        conversation = await prisma.conversation.findUnique({
          where: { emailId: matchingEmail.id },
          include: { email: { include: { contact: true, company: true } }, messages: { orderBy: { createdAt: 'asc' } } },
        });

        if (conversation && !conversation.gmailThreadId) {
          await prisma.conversation.update({ where: { id: conversation.id }, data: { gmailThreadId: reply.threadId } });
          await prisma.email.update({ where: { id: matchingEmail.id }, data: { gmailThreadId: reply.threadId } });
        }
      }
    }

    if (!conversation) return null;

    // Skip duplicates
    const existing = await prisma.conversationMessage.findFirst({ where: { gmailMessageId: reply.id } });
    if (existing) return null;

    // Classify intent
    const { ReplyIntentAgent, ConversationReplyAgent } = await import('@hermes/agents');
    const intentAgent = new ReplyIntentAgent();
    const originalEmail = conversation.email;

    const intentResult = await intentAgent.run({
      inboundEmailBody: reply.body,
      conversationContext: {
        companyName: originalEmail.company.name,
        contactName: `${originalEmail.contact?.firstName ?? ''} ${originalEmail.contact?.lastName ?? ''}`.trim(),
        serviceMode: originalEmail.serviceMode?.toLowerCase() ?? 'erp',
        originalSubject: originalEmail.subject,
        previousMessages: conversation.messages.map((m) => ({ direction: m.direction.toLowerCase(), body: m.body })),
      },
    });

    const intent = intentResult.data?.intent ?? 'UNCLEAR';
    const intentDetails = intentResult.data ?? { intent: 'UNCLEAR', confidence: 0, summary: reply.body.slice(0, 100), suggestedAction: 'Review manually' };

    // Store inbound message
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

    // Suppress on unsubscribe/negative
    if (intent === 'UNSUBSCRIBE' || intent === 'NEGATIVE') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'SUPPRESSED', intent, lastMessageAt: reply.receivedAt, suppressedAt: new Date() },
      });
      await this.gmail.markAsRead(reply.id);
      return { conversationId: conversation.id, gmailMessageId: reply.id, intent, draftReady: false };
    }

    // Schedule follow-up for NOT_NOW
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
      await this.gmail.markAsRead(reply.id);
      return { conversationId: conversation.id, gmailMessageId: reply.id, intent, draftReady: false };
    }

    // Generate draft reply
    let researchSummary = 'No research available';
    let primaryOpportunity: string | undefined;

    if (originalEmail.serviceMode === 'AEO') {
      const aeoR = await prisma.aEOResearch.findFirst({ where: { companyId: conversation.companyId }, orderBy: { createdAt: 'desc' } });
      if (aeoR) { researchSummary = aeoR.summary; primaryOpportunity = aeoR.primaryOpportunity ?? undefined; }
    } else {
      const r = await prisma.research.findFirst({ where: { companyId: conversation.companyId }, orderBy: { createdAt: 'desc' } });
      if (r) researchSummary = r.summary;
    }

    const replyAgent = new ConversationReplyAgent();
    const draftResult = await replyAgent.run({
      companyName: originalEmail.company.name,
      contactName: `${originalEmail.contact?.firstName ?? ''} ${originalEmail.contact?.lastName ?? ''}`.trim(),
      contactRole: originalEmail.contact?.role ?? 'Decision Maker',
      serviceMode: (originalEmail.serviceMode?.toLowerCase() ?? 'erp') as 'erp' | 'aeo' | 'seo',
      originalEmail: { subject: originalEmail.subject, body: originalEmail.body },
      thread: [...conversation.messages, {
        id: 'temp', conversationId: conversation.id, direction: 'INBOUND' as const,
        subject: reply.subject, body: reply.body, fromEmail: reply.from, toEmail: reply.to,
        gmailMessageId: reply.id, intent, intentDetails: null, draftBody: null,
        approvedAt: null, sentAt: null, createdAt: reply.receivedAt,
      }].map((m) => ({
        direction: m.direction.toLowerCase() as 'outbound' | 'inbound',
        body: m.body,
        sentAt: m.createdAt.toISOString(),
      })),
      researchSummary,
      primaryOpportunity,
      intent: intent as import('@hermes/shared').ReplyIntent,
      intentDetails: intentDetails as import('@hermes/shared').ReplyIntentResult,
    });

    const draftBody = draftResult.data?.body ?? null;

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

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: draftBody ? 'DRAFT_READY' : 'REPLIED', intent, lastMessageAt: reply.receivedAt },
    });

    await logActivity({
      type: 'conversation.replied',
      entityType: 'conversation',
      entityId: conversation.id,
      companyId: conversation.companyId,
      meta: { intent, draftReady: !!draftBody },
    });

    await prisma.company.update({ where: { id: conversation.companyId }, data: { status: 'REPLIED' } });
    await this.gmail.markAsRead(reply.id);

    return { conversationId: conversation.id, gmailMessageId: reply.id, intent, draftReady: !!draftBody };
  }

  async simulateReply(conversationId: string, replyBody: string) {
    const conversation = await this.getById(conversationId);

    // Add an inbound test message
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'INBOUND',
        subject: `Re: ${conversation.email.subject}`,
        body: replyBody,
        fromEmail: conversation.email.contact?.email ?? 'unknown@test.com',
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'REPLIED', lastMessageAt: new Date() },
    });

    // Run the full reply pipeline to classify and draft
    return this.regenerateDraft(conversationId);
  }

  async suppress(conversationId: string, reason: string) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'SUPPRESSED', suppressedAt: new Date(), followUpNote: reason },
    });
    return { success: true };
  }

  async getStats() {
    const [total, awaitingReply, draftReady, pendingSend, suppressed, meetingBooked] =
      await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { status: 'AWAITING_REPLY' } }),
        prisma.conversation.count({ where: { status: 'DRAFT_READY' } }),
        prisma.conversation.count({ where: { status: 'PENDING_SEND_APPROVAL' } }),
        prisma.conversation.count({ where: { status: 'SUPPRESSED' } }),
        prisma.conversation.count({ where: { status: 'MEETING_BOOKED' } }),
      ]);

    return { total, awaitingReply, draftReady, pendingSend, suppressed, meetingBooked };
  }
}
