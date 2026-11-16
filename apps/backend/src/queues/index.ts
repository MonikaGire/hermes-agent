import { Queue, Worker } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';

export const QUEUE_NAMES = {
  PROSPECT_DISCOVERY: 'prospect-discovery',
  RESEARCH: 'research',
  EMAIL_GENERATION: 'email-generation',
  EMAIL_SENDING: 'email-sending',
  FOLLOW_UP: 'follow-up',
  REPLY_PROCESSING: 'reply-processing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

export async function initQueues(): Promise<void> {
  const connection = getBullMQConnection();

  for (const name of Object.values(QUEUE_NAMES)) {
    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: Number(process.env['QUEUE_RETRY_ATTEMPTS'] ?? 3),
        backoff: { type: 'exponential', delay: Number(process.env['QUEUE_RETRY_DELAY'] ?? 5000) },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    queues.set(name, queue);
    logger.debug(`Queue initialized: ${name}`);
  }
}

export function getQueue(name: QueueName): Queue {
  const q = queues.get(name);
  if (!q) throw new Error(`Queue "${name}" not initialized`);
  return q;
}

export async function closeQueues(): Promise<void> {
  for (const worker of workers.values()) await worker.close();
  for (const queue of queues.values()) await queue.close();
}
