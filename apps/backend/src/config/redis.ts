import { Redis } from 'ioredis';
import { logger } from './logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function connectRedis(): Promise<Redis> {
  const url = process.env['REDIS_URL'];
  const host = process.env['REDIS_HOST'] ?? 'localhost';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  const password = process.env['REDIS_PASSWORD'] ?? undefined;

  redisClient = url
    ? new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true, retryStrategy: () => null })
    : new Redis({ host, port, password, maxRetriesPerRequest: null, lazyConnect: true, retryStrategy: () => null });

  redisClient.on('error', (err) => logger.error('Redis error', { error: err }));
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting'));

  await redisClient.connect();
  return redisClient;
}

export function getBullMQConnection(): { host: string; port: number; password?: string; maxRetriesPerRequest: null } {
  const url = process.env['REDIS_URL'];
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    };
  }
  return {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
    password: process.env['REDIS_PASSWORD'] || undefined,
    maxRetriesPerRequest: null,
  };
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
