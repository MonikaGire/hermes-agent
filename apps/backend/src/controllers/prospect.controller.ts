import type { Request, Response } from 'express';
import { ProspectService } from '../services/prospect.service.js';
import { DiscoveryService } from '../services/discovery.service.js';
import { prisma } from '@hermes/database';
import { sendSuccess, sendCreated, paginate } from '../utils/response.js';
import { createProspectSchema, updateProspectSchema } from '../validators/prospect.validator.js';

export class ProspectController {
  private readonly svc = new ProspectService();
  private readonly discovery = new DiscoveryService();

  async list(req: Request, res: Response): Promise<void> {
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const { data, total } = await this.svc.list({ page, limit, query: req.query });
    sendSuccess(res, data, { meta: paginate(total, page, limit) });
  }

  async stats(_req: Request, res: Response): Promise<void> {
    const data = await this.svc.getStats();
    sendSuccess(res, data);
  }

  async get(req: Request, res: Response): Promise<void> {
    const data = await this.svc.getById(req.params['id'] as string);
    sendSuccess(res, data);
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = createProspectSchema.parse(req.body);
    const data = await this.svc.create(dto);
    sendCreated(res, data, 'Prospect created');
  }

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateProspectSchema.parse(req.body);
    const data = await this.svc.update(req.params['id'] as string, dto);
    sendSuccess(res, data, 'Prospect updated');
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.svc.remove(req.params['id'] as string);
    sendSuccess(res, null, 'Prospect deleted');
  }

  async triggerResearch(req: Request, res: Response): Promise<void> {
    const job = await this.svc.triggerResearch(req.params['id'] as string);
    sendSuccess(res, { jobId: job.jobId }, 'Research job queued');
  }

  async triggerEmail(req: Request, res: Response): Promise<void> {
    const job = await this.svc.triggerEmailGeneration(req.params['id'] as string);
    sendSuccess(res, { jobId: job.id }, 'Email generation job queued');
  }

  async findContacts(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const company = await prisma.company.findUniqueOrThrow({ where: { id } });

    if (!company.website) {
      sendSuccess(res, { created: 0 }, 'No website — cannot scrape contacts');
      return;
    }

    const { contacts: scraped, reachable } = await this.discovery.scrapeContactsWithStatus(company.website, company.name);

    if (!reachable) {
      sendSuccess(res, { created: 0, reachable: false }, 'Website unreachable — this company may not exist. Try Google Maps discovery for real companies.');
      return;
    }

    const emails = scraped.filter((c) => c.type === 'email');
    const phones = scraped.filter((c) => c.type === 'phone' || c.type === 'whatsapp');

    // Fetch emails already saved for this company to avoid duplicates
    const existing = await prisma.contact.findMany({
      where: { companyId: id },
      select: { email: true },
    });
    const existingEmails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean));

    let created = 0;
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i]?.value;
      if (!email || existingEmails.has(email.toLowerCase())) continue;

      await prisma.contact.create({
        data: {
          companyId: id,
          firstName: 'Contact',
          lastName: company.name.split(' ')[0] ?? '',
          role: 'Operations Manager',
          email,
          phone: phones[i]?.value,
        },
      });
      existingEmails.add(email.toLowerCase());
      created++;
    }

    sendSuccess(res, { created }, created > 0 ? `Found ${created} new contact${created !== 1 ? 's' : ''}` : 'No new contacts found');
  }
}
