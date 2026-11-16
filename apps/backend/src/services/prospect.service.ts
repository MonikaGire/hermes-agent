import { prisma } from '@hermes/database';
import type { ProspectStatus, ServiceMode } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';
import type { CreateProspectDto, UpdateProspectDto } from '../validators/prospect.validator.js';

export class ProspectService {
  async list(opts: { page: number; limit: number; query: Record<string, unknown> }) {
    const { page, limit, query } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(query['search'] ? {
        name: { contains: query['search'] as string, mode: 'insensitive' as const },
      } : {}),
      ...(query['industry'] ? { industry: query['industry'] as string } : {}),
      ...(query['country'] ? { country: query['country'] as string } : {}),
      ...(query['status'] ? { status: query['status'] as ProspectStatus } : {}),
      ...(query['serviceMode'] ? { serviceMode: query['serviceMode'] as ServiceMode } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { contacts: true, emails: true } },
          contacts: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return { data, total };
  }

  async getStats() {
    const [total, allCompanies] = await Promise.all([
      prisma.company.count(),
      prisma.company.findMany({ select: { status: true, industry: true, country: true } }),
    ]);

    const statusMap = new Map<string, number>();
    const industryMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    for (const c of allCompanies) {
      statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);
      industryMap.set(c.industry, (industryMap.get(c.industry) ?? 0) + 1);
      countryMap.set(c.country, (countryMap.get(c.country) ?? 0) + 1);
    }

    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));
    const byIndustry = Array.from(industryMap.entries())
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const byCountry = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { total, byStatus, byIndustry, byCountry };
  }

  async getById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: true,
        research: { orderBy: { createdAt: 'desc' }, take: 1 },
        painPoints: { orderBy: { evidenceScore: 'desc' } },
        emails: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    if (!company) throw new AppError('Prospect not found', 404);
    return company;
  }

  async create(dto: CreateProspectDto) {
    const company = await prisma.company.create({
      data: {
        name: dto.companyName,
        website: dto.website,
        industry: dto.industry,
        country: dto.country,
        employeeCount: dto.employeeCount,
        revenueEstimate: dto.revenueEstimate,
        description: dto.notes,
        source: 'manual',
      },
    });
    await logActivity({ type: 'prospect.created', entityType: 'company', entityId: company.id, companyId: company.id });
    return company;
  }

  async update(id: string, dto: UpdateProspectDto) {
    await this.getById(id);
    const data: Record<string, unknown> = {};
    if (dto.companyName) data['name'] = dto.companyName;
    if (dto.website) data['website'] = dto.website;
    if (dto.industry) data['industry'] = dto.industry;
    if (dto.country) data['country'] = dto.country;
    if (dto.employeeCount) data['employeeCount'] = dto.employeeCount;
    if (dto.revenueEstimate) data['revenueEstimate'] = dto.revenueEstimate;
    if (dto.status) data['status'] = dto.status.toUpperCase();
    if (dto.serviceMode) data['serviceMode'] = dto.serviceMode;

    return prisma.company.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.company.delete({ where: { id } });
  }

  async triggerResearch(companyId: string) {
    await this.getById(companyId);
    const { ResearchService } = await import('./research.service.js');
    return new ResearchService().runResearch(companyId);
  }

  async triggerEmailGeneration(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { contacts: { take: 1 } },
    });
    if (!company) throw new AppError('Prospect not found', 404);
    if (company.contacts.length === 0) {
      throw new AppError('Add a contact for this prospect before generating an email.', 400);
    }

    // Try queue first; fall back to synchronous generation if Redis unavailable
    try {
      const { getQueue, QUEUE_NAMES } = await import('../queues/index.js');
      const queue = getQueue(QUEUE_NAMES.EMAIL_GENERATION);
      return queue.add('generate', { companyId }, { priority: 2 });
    } catch {
      const { EmailService } = await import('./email.service.js');
      return new EmailService().generate({ companyId, tone: 'professional' });
    }
  }
}
