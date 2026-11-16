import { prisma } from '@hermes/database';
import type { ProspectStatus } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';
import type { CreateCompanyDto, UpdateCompanyDto } from '../validators/company.validator.js';

export class CompanyService {
  async list(opts: { page: number; limit: number; query: Record<string, unknown> }) {
    const { page, limit, query } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(query['search'] ? {
        OR: [
          { name: { contains: query['search'] as string, mode: 'insensitive' as const } },
          { industry: { contains: query['search'] as string, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(query['industry'] ? { industry: query['industry'] as string } : {}),
      ...(query['country'] ? { country: query['country'] as string } : {}),
      ...(query['status'] ? { status: query['status'] as ProspectStatus } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { contacts: true, emails: true } } },
      }),
      prisma.company.count({ where }),
    ]);

    return { data, total };
  }

  async getById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: true,
        research: { orderBy: { createdAt: 'desc' }, take: 1 },
        painPoints: true,
        emails: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { contacts: true, emails: true } },
      },
    });
    if (!company) throw new AppError('Company not found', 404);
    return company;
  }

  async create(dto: CreateCompanyDto) {
    const company = await prisma.company.create({ data: dto });
    await logActivity({ type: 'company.created', entityType: 'company', entityId: company.id, companyId: company.id });
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.getById(id);
    const company = await prisma.company.update({ where: { id }, data: dto });
    await logActivity({ type: 'company.updated', entityType: 'company', entityId: id, companyId: id });
    return company;
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.company.delete({ where: { id } });
  }
}
