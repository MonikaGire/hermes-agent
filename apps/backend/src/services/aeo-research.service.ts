import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';

export class AEOResearchService {
  async getByCompanyId(companyId: string) {
    const research = await prisma.aEOResearch.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { company: true },
    });
    if (!research) throw new AppError('AEO research not found for this company', 404);
    return research;
  }

  async run(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new AppError('Company not found', 404);

    await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHING' } });

    const { AEOResearchAgent } = await import('@hermes/agents');
    const agent = new AEOResearchAgent();

    const result = await agent.run({
      companyName: company.name,
      website: company.website ?? '',
      industry: company.industry,
      country: company.country,
    });

    if (!result.success || !result.data) {
      await prisma.company.update({ where: { id: companyId }, data: { status: 'NEW' } });
      throw new AppError(`AEO research failed: ${result.error}`, 500);
    }

    const data = result.data;

    const research = await prisma.aEOResearch.create({
      data: {
        companyId,
        appearsInAIAnswers: data.appearsInAIAnswers,
        aiAnswerEvidence: data.aiAnswerEvidence,
        competitorAIPresence: data.competitorAIPresence,
        faqContentGaps: data.faqContentGaps,
        schemaMarkupStatus: data.schemaMarkupStatus,
        brandMentions: data.brandMentions,
        contentQualityNotes: data.contentQualityNotes,
        aeoOpportunities: data.opportunities as unknown as import('@prisma/client').Prisma.InputJsonValue,
        primaryOpportunity: data.primaryOpportunity,
        opportunityScore: data.opportunityScore,
        summary: data.summary,
      },
    });

    await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHED' } });
    await logActivity({ type: 'aeo.researched', entityType: 'company', entityId: companyId, companyId });

    return research;
  }
}
