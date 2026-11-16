import { prisma } from '@hermes/database';
import type { Prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';

export class ResearchService {
  async list(opts: { page: number; limit: number }) {
    const { page, limit } = opts;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.research.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { id: true, name: true, industry: true, country: true } } },
      }),
      prisma.research.count(),
    ]);

    return { data, total };
  }

  async getByCompanyId(companyId: string) {
    const research = await prisma.research.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { company: true },
    });
    if (!research) throw new AppError('Research not found for this company', 404);
    return research;
  }

  async runResearch(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new AppError('Company not found', 404);

    // Try queue first; fall back to synchronous execution if Redis isn't available
    try {
      const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
      const queue = getQueue(QUEUE_NAMES.RESEARCH);
      await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHING' } });
      const job = await queue.add('research', { companyId });
      return { jobId: job.id, mode: 'queued' };
    } catch {
      // Redis not available — run synchronously
      return this.runResearchSync(companyId);
    }
  }

  async runResearchSync(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new AppError('Company not found', 404);

    await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHING' } });

    const { SerpApiService } = await import('../integrations/serpapi.service.js');
    const { ClearbitService } = await import('../integrations/clearbit.service.js');
    const { CompanyResearchAgent, PainPointAnalysisAgent } = await import('@hermes/agents');

    const serpApi = new SerpApiService();
    const clearbit = new ClearbitService();
    const researchAgent = new CompanyResearchAgent();
    const painPointAgent = new PainPointAnalysisAgent();

    const [serpResults, clearbitData] = await Promise.allSettled([
      company.website ? serpApi.researchCompany(company.name, company.website) : Promise.resolve(null),
      company.website
        ? clearbit
            .enrichCompany(new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`).hostname)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const serpData = serpResults.status === 'fulfilled' ? serpResults.value : null;
    const clearbitInfo = clearbitData.status === 'fulfilled' ? clearbitData.value : null;

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
      throw new AppError(`Research failed: ${researchResult.error}`, 500);
    }

    const research = researchResult.data;

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

    const painResult = await painPointAgent.run({
      research,
      industry: company.industry,
      companySize: company.employeeCount ?? undefined,
    });

    if (painResult.success && painResult.data?.painPoints.length) {
      await prisma.painPoint.createMany({
        data: painResult.data.painPoints.map((pp, i) => ({
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

    return { jobId: 'sync', mode: 'sync', researchId: savedResearch.id };
  }
}
