import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { EmailSenderService } from '../integrations/email-sender.service.js';
import { nofoalWaitlistEmail } from '../templates/nofoal-waitlist.js';
import { logger } from '../config/logger.js';

const sender = new EmailSenderService();

export class WaitlistService {
  async ingest(data: { email: string; name?: string; source?: string }) {
    const existing = await prisma.waitlistLead.findFirst({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) return { lead: existing, created: false };

    const lead = await prisma.waitlistLead.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        source: data.source ?? 'nofoal-waitlist',
        status: 'PENDING',
      },
    });

    logger.info('Waitlist lead ingested', { email: lead.email, id: lead.id });
    return { lead, created: true };
  }

  async list(opts: { page: number; limit: number; status?: string; search?: string }) {
    const { page, limit, status, search } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status: status as 'PENDING' | 'SENT' | 'REJECTED' } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.waitlistLead.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.waitlistLead.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async approve(id: string) {
    const lead = await prisma.waitlistLead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Waitlist lead not found', 404);
    if (lead.status === 'SENT') throw new AppError('Email already sent to this lead', 400);

    const { subject, html } = nofoalWaitlistEmail(lead.email);
    const fromAddr = process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? '';

    await sender.send({ to: lead.email, subject, html, from: `NOFOAL <${fromAddr}>` });

    const updated = await prisma.waitlistLead.update({
      where: { id },
      data: { status: 'SENT', emailSentAt: new Date() },
    });

    logger.info('Waitlist email sent', { email: lead.email, id: lead.id });
    return updated;
  }

  async approveAll() {
    const pending = await prisma.waitlistLead.findMany({ where: { status: 'PENDING' } });
    let sent = 0;
    let failed = 0;

    for (const lead of pending) {
      try {
        const { subject, html } = nofoalWaitlistEmail(lead.email);
        const fromAddr = process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? '';
        await sender.send({ to: lead.email, subject, html, from: `NOFOAL <${fromAddr}>` });
        await prisma.waitlistLead.update({
          where: { id: lead.id },
          data: { status: 'SENT', emailSentAt: new Date() },
        });
        sent++;
      } catch (err) {
        logger.error('Failed to send waitlist email', { email: lead.email, err });
        failed++;
      }
    }

    return { sent, failed, total: pending.length };
  }

  async reject(id: string) {
    const lead = await prisma.waitlistLead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Waitlist lead not found', 404);

    return prisma.waitlistLead.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  async stats() {
    const [total, pending, sent, rejected] = await Promise.all([
      prisma.waitlistLead.count(),
      prisma.waitlistLead.count({ where: { status: 'PENDING' } }),
      prisma.waitlistLead.count({ where: { status: 'SENT' } }),
      prisma.waitlistLead.count({ where: { status: 'REJECTED' } }),
    ]);
    return { total, pending, sent, rejected };
  }

  async importCsv(csvText: string, source: string) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { imported: 0, skipped: 0, errors: 0 };

    const parseRow = (line: string): string[] => {
      const cols: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      return cols;
    };

    const header = parseRow(lines[0]!).map(h => h.toLowerCase().replace(/['"]/g, '').trim());
    const emailIdx = header.findIndex(h => h.includes('email'));
    const nameIdx = header.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname');

    if (emailIdx === -1) throw new AppError('CSV must have an "Email" column', 400);

    // Bulk-fetch existing emails for fast dedup
    const existingEmails = new Set(
      (await prisma.waitlistLead.findMany({ select: { email: true } })).map(l => l.email)
    );

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = parseRow(line);
      const raw = cols[emailIdx]?.replace(/['"]/g, '').trim();
      const email = raw?.toLowerCase();
      const name = nameIdx !== -1 ? cols[nameIdx]?.replace(/['"]/g, '').trim() : undefined;

      if (!email || !email.includes('@') || !email.includes('.')) { errors++; continue; }
      if (existingEmails.has(email)) { skipped++; continue; }

      await prisma.waitlistLead.create({
        data: { email, name: name || undefined, source, status: 'PENDING' },
      });
      existingEmails.add(email);
      imported++;
    }

    logger.info('Waitlist CSV import complete', { imported, skipped, errors });
    return { imported, skipped, errors };
  }

  async delete(id: string) {
    const lead = await prisma.waitlistLead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Waitlist lead not found', 404);
    await prisma.waitlistLead.delete({ where: { id } });
  }

  async convertToProspect(id: string, serviceMode: 'ERP' | 'AEO' | 'SEO' = 'ERP') {
    const lead = await prisma.waitlistLead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);
    if (lead.status === 'SENT') return { skipped: true, reason: 'Already in pipeline' };

    const result = await this.createProspectFromLead(lead, serviceMode);

    await prisma.waitlistLead.update({ where: { id }, data: { status: 'SENT', emailSentAt: new Date() } });
    return { ...result, converted: true };
  }

  async convertAllToProspects(serviceMode: 'ERP' | 'AEO' | 'SEO' = 'ERP') {
    const pending = await prisma.waitlistLead.findMany({ where: { status: 'PENDING' } });
    let converted = 0;
    let skipped = 0;

    for (const lead of pending) {
      try {
        await this.createProspectFromLead(lead, serviceMode);
        await prisma.waitlistLead.update({ where: { id: lead.id }, data: { status: 'SENT', emailSentAt: new Date() } });
        converted++;
      } catch {
        skipped++;
      }
    }

    return { converted, skipped, total: pending.length };
  }

  private async createProspectFromLead(lead: { id: string; email: string; name?: string | null }, serviceMode: 'ERP' | 'AEO' | 'SEO' = 'ERP') {
    const PERSONAL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'yahoo.in', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'rediffmail.com', 'mail.com']);

    const [prefix = '', domain = ''] = lead.email.split('@');
    const isPersonal = PERSONAL_DOMAINS.has(domain.toLowerCase());

    // Derive a company name
    const domainBase = domain.split('.')[0] ?? '';
    const companyName = lead.name
      ? lead.name
      : isPersonal
        ? (prefix.replace(/[0-9._-]+/g, ' ').trim() || prefix)
        : (domainBase.charAt(0).toUpperCase() + domainBase.slice(1));

    // Avoid creating duplicate company
    let company = await prisma.company.findFirst({
      where: { name: { equals: companyName, mode: 'insensitive' } },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: companyName,
          website: isPersonal ? undefined : `https://${domain}`,
          industry: 'General',
          country: 'India',
          source: 'organic',
          status: 'NEW',
          serviceMode,
        },
      });
    }

    // Avoid duplicate contact
    const existing = await prisma.contact.findFirst({ where: { email: lead.email } });
    if (!existing) {
      const parts = (lead.name ?? prefix).split(' ');
      await prisma.contact.create({
        data: {
          companyId: company.id,
          firstName: parts[0] ?? prefix,
          lastName: parts.slice(1).join(' ') || '',
          email: lead.email,
          role: 'Decision Maker',
        },
      });
    }

    return { companyId: company.id, companyName: company.name };
  }
}
