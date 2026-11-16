import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { prisma } from '@hermes/database';
import type { Prisma } from '@hermes/database';
import { CompanyResearchAgent } from '@hermes/agents';
import { PainPointAnalysisAgent } from '@hermes/agents';
import { SerpApiService } from '../integrations/serpapi.service.js';
import { ClearbitService } from '../integrations/clearbit.service.js';
import { QUEUE_NAMES } from '../queues/index.js';
import { logActivity } from '../services/activity.service.js';

interface ResearchJobData {
  companyId: string;
}

export function startResearchWorker(): Worker {
  const serpApi = new SerpApiService();
  const clearbit = new ClearbitService();
  const researchAgent = new CompanyResearchAgent();
  const painPointAgent = new PainPointAnalysisAgent();

  const worker = new Worker<ResearchJobData>(
    QUEUE_NAMES.RESEARCH,
    async (job: Job<ResearchJobData>) => {
      const { companyId } = job.data;
      logger.info('Research job started', { companyId, jobId: job.id });

      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        throw new Error(`Company not found: ${companyId}`);
      }

      await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHING' } });

      // Gather external data in parallel
      const [serpResults, clearbitData] = await Promise.allSettled([
        company.website ? serpApi.researchCompany(company.name, company.website) : Promise.resolve(null),
        company.website ? clearbit.enrichCompany(new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`).hostname).catch(() => null) : Promise.resolve(null),
      ]);

      const serpData = serpResults.status === 'fulfilled' ? serpResults.value : null;
      const clearbitInfo = clearbitData.status === 'fulfilled' ? clearbitData.value : null;

      // Run research agent
      const researchResult = await researchAgent.run({
        companyName: company.name,
        website: company.website ?? '',
        industry: company.industry,
        country: company.country,
        ...(serpData && {
          serpResults: {
            news: serpData.news,
            expansion: serpData.expansion,
            hiring: serpData.hiring,
          },
        }),
        ...(clearbitInfo && {
          clearbitData: {
            employees: clearbitInfo.metrics?.employees,
            tech: clearbitInfo.tech,
            description: clearbitInfo.description,
          },
        }),
      });

      if (!researchResult.success || !researchResult.data) {
        await prisma.company.update({ where: { id: companyId }, data: { status: 'NEW' } });
        throw new Error(`Research agent failed: ${researchResult.error}`);
      }

      const research = researchResult.data;

      // Persist research
      const savedResearch = await prisma.research.create({
        data: {
          companyId,
          products: research.products,
          locations: research.locations,
          recentNews: research.recentNews as unknown as Prisma.InputJsonValue,
          expansionPlans: research.expansionPlans,
          hiringActivity: research.hiringActivity,
          techStack: research.techStack,
          investments: research.investments,
          acquisitions: research.acquisitions,
          summary: research.summary ?? '',
          confidenceScore: 0.8,
        },
      });

      // Run pain point analysis
      const painResult = await painPointAgent.run({
        research,
        industry: company.industry,
        companySize: company.employeeCount ?? undefined,
      });

      if (painResult.success && painResult.data?.painPoints.length) {
        const painPoints = painResult.data.painPoints;
        await prisma.painPoint.createMany({
          data: painPoints.map((pp, i) => ({
            companyId,
            problem: pp.problem,
            erpCapability: pp.erpCapability,
            businessOutcome: pp.businessOutcome,
            evidenceScore: pp.evidenceScore,
            isPrimary: i === 0,
          })),
        });
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          status: 'RESEARCHED',
          ...(clearbitInfo?.metrics?.employees && { employeeCount: clearbitInfo.metrics.employees }),
          ...(clearbitInfo?.logo && { logoUrl: clearbitInfo.logo }),
          ...(clearbitInfo?.description && { description: clearbitInfo.description }),
        },
      });

      await logActivity({
        type: 'research.complete',
        entityType: 'company',
        entityId: companyId,
        companyId,
        meta: { researchId: savedResearch.id, painPointCount: painResult.data?.painPoints.length ?? 0 },
      });

      logger.info('Research job complete', { companyId, painPoints: painResult.data?.painPoints.length });
    },
    {
      connection: getBullMQConnection(),
      concurrency: Number(process.env['QUEUE_CONCURRENCY'] ?? 5),
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Research job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
