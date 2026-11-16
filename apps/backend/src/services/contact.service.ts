import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { HunterService } from '../integrations/hunter.service.js';
import { extractDomain } from '@hermes/shared';
import { logActivity } from './activity.service.js';
import type { CreateContactDto, UpdateContactDto } from '../validators/contact.validator.js';

export class ContactService {
  private readonly hunter = new HunterService();

  async list(opts: { page: number; limit: number; query: Record<string, unknown> }) {
    const { page, limit, query } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(query['companyId'] ? { companyId: query['companyId'] as string } : {}),
      ...(query['search'] ? {
        OR: [
          { firstName: { contains: query['search'] as string, mode: 'insensitive' as const } },
          { lastName: { contains: query['search'] as string, mode: 'insensitive' as const } },
          { email: { contains: query['search'] as string, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { id: true, name: true, website: true } } },
      }),
      prisma.contact.count({ where }),
    ]);

    return { data, total };
  }

  async getById(id: string) {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!contact) throw new AppError('Contact not found', 404);
    return contact;
  }

  async create(dto: CreateContactDto) {
    const contact = await prisma.contact.create({ data: dto });
    await logActivity({ type: 'contact.created', entityType: 'contact', entityId: contact.id, companyId: dto.companyId });
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.getById(id);
    return prisma.contact.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.getById(id);
    await prisma.contact.delete({ where: { id } });
  }

  async enrich(id: string) {
    const contact = await this.getById(id);
    const company = contact.company;

    if (!company.website) throw new AppError('Company website required for enrichment', 400);

    const domain = extractDomain(company.website);
    const result = await this.hunter.findEmail({
      firstName: contact.firstName,
      lastName: contact.lastName,
      domain,
    });

    if (result && result.confidence >= 70) {
      const updated = await prisma.contact.update({
        where: { id },
        data: { email: result.email, isVerified: true },
      });
      return updated;
    }

    return contact;
  }
}
