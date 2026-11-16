import 'dotenv/config';
import 'express-async-errors';
import { createApp } from './app.js';
import { logger } from './config/logger.js';
import { connectRedis } from './config/redis.js';
import { initQueues } from './queues/index.js';
import { initTelegramBot } from './bot/telegram.js';
import { startResearchWorker } from './jobs/research.worker.js';
import { startEmailGenerationWorker } from './jobs/email-generation.worker.js';
import { startProspectDiscoveryWorker } from './jobs/prospect-discovery.worker.js';
import { createReplyProcessingWorker } from './jobs/reply-processing.worker.js';
import { initCronJobs } from './jobs/cron.js';

const PORT = process.env['PORT'] ?? 4000;

async function bootstrap(): Promise<void> {
  try {
    // 1. Redis + queues + workers (optional — set QUEUES_ENABLED=true to activate)
    const queuesEnabled = process.env['QUEUES_ENABLED'] === 'true';
    let redisAvailable = false;

    if (queuesEnabled) {
      try {
        await connectRedis();
        logger.info('Redis connected');
        redisAvailable = true;
      } catch (redisErr) {
        logger.warn('Redis unavailable — background queues and workers disabled', { error: redisErr });
      }

      if (redisAvailable) {
        try {
          await initQueues();
          logger.info('BullMQ queues initialized');
          startResearchWorker();
          startEmailGenerationWorker();
          startProspectDiscoveryWorker();
          createReplyProcessingWorker();
          logger.info('Background workers started (research, email-gen, discovery, reply-processing)');
          initCronJobs();
        } catch (queueErr) {
          logger.warn('Queue/worker init failed — continuing without background processing', { error: queueErr });
        }
      }
    } else {
      logger.info('Queues disabled (QUEUES_ENABLED != true) — skipping Redis and workers');
    }

    // 2. Express app
    const app = createApp();
    app.listen(PORT, () => {
      logger.info(`HERMES API running on port ${PORT} [${process.env['NODE_ENV'] ?? 'development'}]`);
    });

    // 3. Telegram bot (optional)
    if (process.env['TELEGRAM_BOT_TOKEN']) {
      try {
        await initTelegramBot();
        logger.info('Telegram bot initialized');
      } catch (botErr) {
        logger.warn('Telegram bot init failed', { error: botErr });
      }
    }

    logger.info(`HERMES initialized${redisAvailable ? '' : ' (degraded: no Redis)'}`);
  } catch (err) {
    logger.error('Fatal startup error', { error: err });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err });
  process.exit(1);
});

void bootstrap();
