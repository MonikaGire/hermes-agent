import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import { prisma } from '@hermes/database';
import { ERP_TARGET_INDUSTRIES, ERP_TARGET_COUNTRIES } from '@hermes/shared';

export function initCronJobs(): void {
  // A bounded daily sample across rotating international metal markets, 8 AM IST.
  // Default: 1 sector x 4 countries x 5 search recipes = 20 search requests/day.
  cron.schedule('0 8 * * *', async () => {
    logger.info('Cron: Starting evidence-first metal ERP discovery');
    try {
      const day = Math.floor(Date.now() / 86_400_000);
      const industry = ERP_TARGET_INDUSTRIES[day % ERP_TARGET_INDUSTRIES.length]!;
      const countries = Array.from({ length: 4 }, (_, index) =>
        ERP_TARGET_COUNTRIES[(day * 4 + index) % ERP_TARGET_COUNTRIES.length]!,
      );
      const queue = getQueue(QUEUE_NAMES.PROSPECT_DISCOVERY);
      await queue.add('daily-metal-erp', {
        industries: [industry],
        countries,
        limit: 20,
      }, { jobId: 'daily-metal-erp-' + day, removeOnComplete: { count: 20 } });
    } catch (err) {
      logger.error('Cron: prospect discovery failed', { error: err });
    }
  }, { timezone: 'Asia/Kolkata' });

  // Research all NEW prospects that haven't been researched (every 2 hours)
  cron.schedule('0 */2 * * *', async () => {
    logger.info('Cron: Queuing research for new prospects');
    try {
      const newProspects = await prisma.company.findMany({
        where: { status: 'NEW' },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      const queue = getQueue(QUEUE_NAMES.RESEARCH);
      for (const company of newProspects) {
        await queue.add('auto-research', { companyId: company.id }, { priority: 3, delay: 2000 });
      }

      if (newProspects.length > 0) {
        logger.info('Cron: Queued research jobs', { count: newProspects.length });
      }
    } catch (err) {
      logger.error('Cron: auto-research failed', { error: err });
    }
  });

  // Auto-generate emails for RESEARCHED prospects (every 4 hours)
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Cron: Queuing email generation for researched prospects');
    try {
      const autoGenerate = await prisma.setting.findUnique({ where: { key: 'autoGenerateEmails' } })
        .then((s) => (s?.value as boolean) ?? false);

      if (!autoGenerate) return;

      const researched = await prisma.company.findMany({
        where: {
          status: 'RESEARCHED',
          contacts: { some: {} },
        },
        take: 5,
        orderBy: { updatedAt: 'asc' },
      });

      const queue = getQueue(QUEUE_NAMES.EMAIL_GENERATION);
      for (const company of researched) {
        await queue.add('auto-generate', { companyId: company.id }, { priority: 3 });
      }

      if (researched.length > 0) {
        logger.info('Cron: Queued email generation jobs', { count: researched.length });
      }
    } catch (err) {
      logger.error('Cron: auto-email generation failed', { error: err });
    }
  });

  // Poll Gmail inbox for replies every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.info('Cron: Polling Gmail inbox for replies');
    try {
      const queue = getQueue(QUEUE_NAMES.REPLY_PROCESSING);
      await queue.add('gmail-poll', {}, {
        jobId: `gmail-poll-${Date.now()}`,
        removeOnComplete: { count: 20 },
      });
    } catch (err) {
      logger.error('Cron: Gmail poll job failed', { error: err });
    }
  });

  // Send due follow-ups (conversations marked FOLLOW_UP_SCHEDULED)
  cron.schedule('0 */1 * * *', async () => {
    logger.info('Cron: Checking due follow-up conversations');
    try {
      const dueConversations = await prisma.conversation.findMany({
        where: {
          status: 'FOLLOW_UP_SCHEDULED',
          followUpAt: { lte: new Date() },
        },
        take: 10,
      });
      if (dueConversations.length > 0) {
        logger.info('Cron: Follow-ups due', { count: dueConversations.length });
        // Queue each for reply processing to generate fresh follow-up draft
        const queue = getQueue(QUEUE_NAMES.REPLY_PROCESSING);
        for (const conv of dueConversations) {
          await queue.add('follow-up-due', { conversationId: conv.id });
        }
      }
    } catch (err) {
      logger.error('Cron: follow-up check failed', { error: err });
    }
  });

  // Daily stats summary (8:30 AM UTC — before discovery run)
  cron.schedule('30 8 * * *', async () => {
    try {
      const [total, sent, pending, converted] = await Promise.all([
        prisma.company.count(),
        prisma.email.count({ where: { status: 'SENT' } }),
        prisma.email.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.company.count({ where: { status: 'CONVERTED' } }),
      ]);

      logger.info('Daily HERMES stats', { totalProspects: total, emailsSent: sent, pendingApproval: pending, conversions: converted });
    } catch (err) {
      logger.error('Cron: daily stats failed', { error: err });
    }
  });

  logger.info('Cron jobs initialized (4 schedules)');
}
