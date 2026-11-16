import { prisma } from '@hermes/database';

export class DashboardService {
  async getStats() {
    const [
      totalProspects,
      emailsGenerated,
      emailsApproved,
      emailsSent,
      totalReplied,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.email.count({ where: { status: { not: 'DRAFT' } } }),
      prisma.email.count({ where: { status: 'APPROVED' } }),
      prisma.email.count({ where: { status: 'SENT' } }),
      prisma.company.count({ where: { status: 'REPLIED' } }),
    ]);

    const replyRate = emailsSent > 0 ? (totalReplied / emailsSent) * 100 : 0;
    const conversions = await prisma.company.count({ where: { status: 'CONVERTED' } });

    return {
      totalProspects,
      emailsGenerated,
      emailsApproved,
      emailsSent,
      replyRate: Math.round(replyRate * 10) / 10,
      conversions,
    };
  }

  async getRecentActivity(limit: number) {
    return prisma.activity.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
  }

  async getConversionStats() {
    const [allCompanies, thirtyDaysAgo] = [
      await prisma.company.findMany({ select: { industry: true, country: true, status: true } }),
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    ];

    // Aggregate by industry+status in memory
    const industryMap = new Map<string, Map<string, number>>();
    const countryMap = new Map<string, Map<string, number>>();
    for (const c of allCompanies) {
      if (!industryMap.has(c.industry)) industryMap.set(c.industry, new Map());
      const im = industryMap.get(c.industry)!;
      im.set(c.status, (im.get(c.status) ?? 0) + 1);

      if (!countryMap.has(c.country)) countryMap.set(c.country, new Map());
      const cm = countryMap.get(c.country)!;
      cm.set(c.status, (cm.get(c.status) ?? 0) + 1);
    }

    const byIndustry = Array.from(industryMap.entries()).map(([industry, statuses]) => ({
      industry,
      statuses: Object.fromEntries(statuses),
      total: Array.from(statuses.values()).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total);

    const byCountry = Array.from(countryMap.entries()).map(([country, statuses]) => ({
      country,
      statuses: Object.fromEntries(statuses),
      total: Array.from(statuses.values()).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total);

    const recentEmails = await prisma.email.findMany({
      where: { sentAt: { gte: thirtyDaysAgo } },
      select: { sentAt: true, status: true },
    });

    return { byIndustry, byCountry, recentEmails };
  }
}
