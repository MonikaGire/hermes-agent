import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { QUEUE_NAMES } from '../queues/index.js';
import { EmailService } from '../services/email.service.js';

interface EmailJobData {
  companyId: string;
  emailId?: string;
}

export function startEmailGenerationWorker(): Worker {
  const emailService = new EmailService();

  const worker = new Worker<EmailJobData>(
    QUEUE_NAMES.EMAIL_GENERATION,
    async (job: Job<EmailJobData>) => {
      const { companyId, emailId } = job.data;
      logger.info('Email generation job started', { companyId, jobId: job.id });

      // Delegate to EmailService which handles ERP / AEO / SEO routing
      const created = await emailService.generate({ companyId, tone: 'professional' });

      // If this is a revision request, mark the old email as skipped
      if (emailId) {
        const { prisma } = await import('@hermes/database');
        await prisma.email.update({ where: { id: emailId }, data: { status: 'SKIPPED' } });
      }

      logger.info('Email generation complete', { companyId, emailId: created.id });
    },
    {
      connection: getBullMQConnection(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Email generation job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
