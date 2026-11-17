import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { DiscoveryService } from '../services/discovery.service.js';
import { QUEUE_NAMES } from '../queues/index.js';

interface DiscoveryJobData {
  industries?: string[];
  countries?: string[];
  limit?: number;
}

export function startProspectDiscoveryWorker(): Worker {
  const discovery = new DiscoveryService();

  const worker = new Worker<DiscoveryJobData>(
    QUEUE_NAMES.PROSPECT_DISCOVERY,
    async (job: Job<DiscoveryJobData>) => {
      const {
        industries = ['Sheet metal fabrication', 'Steel service center', 'Laser cutting'],
        countries = ['USA', 'UK', 'Australia', 'UAE'],
        limit = 20,
      } = job.data;

      let imported = 0;
      let reviewedCandidates = 0;
      let failedSearches = 0;
      const perMarket = Math.max(1, Math.ceil(limit / Math.max(1, industries.length * countries.length)));

      // One live, source-backed search per sector/market — no LLM-memory recall.
      for (const industry of industries) {
        for (const country of countries) {
          try {
            const results = await discovery.search({ industry, country, limit: perMarket });
            reviewedCandidates += results.length;
            if (!results.length) continue;
            const saved = await discovery.importCompanies(results, {
              autoResearch: true,
              autoEmail: false, // An unreviewed search excerpt must never trigger outreach.
              serviceMode: 'ERP',
            });
            imported += saved.imported;
          } catch (error) {
            failedSearches++;
            logger.warn('ERP discovery market failed', {
              industry,
              country,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      if (failedSearches === industries.length * countries.length) {
        throw new Error('All ERP discovery markets failed; check SerpAPI credentials and search provider.');
      }
      logger.info('Evidence-first ERP discovery complete', { jobId: job.id, reviewedCandidates, imported, failedSearches });
    },
    { connection: getBullMQConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => logger.error('Prospect discovery job failed', { jobId: job?.id, error: err.message }));
  return worker;
}
