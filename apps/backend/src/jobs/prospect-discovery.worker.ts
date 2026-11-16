import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { prisma } from '@hermes/database';
import { ProspectFinderAgent } from '@hermes/agents';
import { ApolloService } from '../integrations/apollo.service.js';
import { QUEUE_NAMES } from '../queues/index.js';
import { logActivity } from '../services/activity.service.js';

interface DiscoveryJobData {
  industries?: string[];
  countries?: string[];
  limit?: number;
}

export function startProspectDiscoveryWorker(): Worker {
  const finder = new ProspectFinderAgent();
  const apollo = new ApolloService();

  const worker = new Worker<DiscoveryJobData>(
    QUEUE_NAMES.PROSPECT_DISCOVERY,
    async (job: Job<DiscoveryJobData>) => {
      const {
        industries = ['Electronics', 'Packaging', 'Plastics'],
        countries = ['USA', 'UK'],
        limit = 10,
      } = job.data;

      logger.info('Prospect discovery job started', { industries, countries, limit });

      // Get existing companies to avoid duplicates
      const existing = await prisma.company.findMany({
        select: { name: true },
        take: 500,
      });
      const existingNames = existing.map((c) => c.name);

      let totalCreated = 0;

      for (const industry of industries) {
        for (const country of countries) {
          const result = await finder.run({
            industry,
            country,
            limit: Math.ceil(limit / (industries.length * countries.length)),
            existingCompanies: existingNames,
          });

          if (!result.success || !result.data) continue;

          for (const candidate of result.data) {
            // Skip if already exists
            if (existingNames.some((n) => n.toLowerCase() === candidate.companyName.toLowerCase())) continue;

            const company = await prisma.company.create({
              data: {
                name: candidate.companyName,
                website: candidate.website,
                industry: candidate.industry,
                country: candidate.country,
                employeeCount: candidate.estimatedEmployees,
                source: 'ai-discovery',
                status: 'NEW',
              },
            });

            existingNames.push(company.name);
            totalCreated++;

            await logActivity({
              type: 'prospect.created',
              entityType: 'company',
              entityId: company.id,
              companyId: company.id,
              meta: { confidence: candidate.confidence, source: 'ai-discovery' },
            });

            // Auto-queue research for high-confidence candidates
            if (candidate.confidence >= 0.8) {
              const researchQueue = (await import('../queues/index.js')).getQueue(QUEUE_NAMES.RESEARCH);
              await researchQueue.add('research', { companyId: company.id }, { priority: 2, delay: 5000 });
            }
          }
        }
      }

      logger.info('Prospect discovery complete', { totalCreated });
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // One discovery run at a time
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Prospect discovery job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
