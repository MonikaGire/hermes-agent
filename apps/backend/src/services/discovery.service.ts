import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import { logActivity } from './activity.service.js';
import { logger } from '../config/logger.js';
import { SerpApiService } from '../integrations/serpapi.service.js';
import { ProspectFinderAgent } from '@hermes/agents';

export interface DiscoveredCompany {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  region?: string;
  estimatedEmployees?: number;
  confidence: number;
  rationale: string;
  contacts: ExtractedContact[];
  source: 'google' | 'ai' | 'maps';
}

export interface ExtractedContact {
  type: 'email' | 'phone' | 'whatsapp';
  value: string;
  label?: string;
}

export interface DiscoverySearchParams {
  industry: string;
  country: string;
  region?: string;
  keywords?: string;
  limit: number;
}

const SCRAPER_URL = process.env['SCRAPER_URL'] ?? 'http://localhost:5001';

export class DiscoveryService {
  private readonly finderAgent = new ProspectFinderAgent();

  private async getSerpApiKey(): Promise<string> {
    const row = await prisma.integration.findUnique({ where: { provider: 'serpapi' } }).catch(() => null);
    const dbKey = (row?.config as Record<string, string> | null)?.['apiKey'] ?? '';
    return dbKey || (process.env['SERPAPI_KEY'] ?? '');
  }

  async search(params: DiscoverySearchParams): Promise<DiscoveredCompany[]> {
    const key = await this.getSerpApiKey();
    const hasSerpApi = !!(key && key !== 'your-serpapi-key');

    if (hasSerpApi) {
      return this.searchWithGoogle(params, key);
    }
    return this.searchWithAI(params);
  }

  private async searchWithGoogle(params: DiscoverySearchParams, apiKey: string): Promise<DiscoveredCompany[]> {
    const serpApi = new SerpApiService(apiKey);
    const { industry, country, region, keywords, limit } = params;
    const location = region ? `${region}, ${country}` : country;
    const query = keywords
      ? `${keywords} ${industry} manufacturing company ${location}`
      : `${industry} manufacturing company ${location} site:linkedin.com OR site:clutch.co OR -site:amazon.com`;

    const results = await serpApi.search(query, { num: Math.min(limit * 2, 20) });

    const companies: DiscoveredCompany[] = [];
    for (const r of results.slice(0, limit)) {
      try {
        const domain = r.link ? new URL(r.link).hostname.replace('www.', '') : '';
        if (!domain || domain.includes('linkedin') || domain.includes('facebook')) continue;

        const companyName = r.title.replace(/ [-|–].*/g, '').trim();
        const contacts = await this.scrapeContacts(`https://${domain}`, companyName);

        companies.push({
          companyName,
          website: `https://${domain}`,
          industry,
          country,
          region,
          confidence: 0.75,
          rationale: r.snippet,
          contacts,
          source: 'google',
        });
      } catch {
        // skip malformed results
      }
    }
    return companies;
  }

  private async searchWithAI(params: DiscoverySearchParams): Promise<DiscoveredCompany[]> {
    const { industry, country, region, keywords, limit } = params;

    const result = await this.finderAgent.run({
      industry,
      country: region ? `${region}, ${country}` : country,
      limit,
    });

    if (!result.success || !result.data) {
      logger.error('ProspectFinderAgent failed', { error: result.error });
      return [];
    }

    const companies: DiscoveredCompany[] = [];
    for (const c of result.data) {
      const contacts = c.website ? await this.scrapeContacts(c.website, c.companyName) : [];
      companies.push({
        ...c,
        region,
        contacts,
        source: 'ai',
      });
    }
    return companies;
  }

  async scrapeContacts(websiteUrl: string, companyName: string): Promise<ExtractedContact[]> {
    return (await this.scrapeContactsWithStatus(websiteUrl, companyName)).contacts;
  }

  async scrapeContactsWithStatus(
    websiteUrl: string,
    companyName: string,
  ): Promise<{ contacts: ExtractedContact[]; reachable: boolean }> {
    try {
      const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HermesBot/1.0)' },
      });
      clearTimeout(timeout);

      const html = await res.text();
      return { contacts: this.extractContactsFromHtml(html), reachable: true };
    } catch {
      logger.debug('Contact scrape failed — website unreachable', { websiteUrl, companyName });
      return { contacts: [], reachable: false };
    }
  }

  private extractContactsFromHtml(html: string): ExtractedContact[] {
    const contacts: ExtractedContact[] = [];
    const seen = new Set<string>();

    const add = (type: ExtractedContact['type'], value: string, label?: string) => {
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        contacts.push({ type, value, label });
      }
    };

    // Emails — skip generic/noreply addresses
    const emailRegex = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
    const skipEmail = /noreply|no-reply|donotreply|example|test@|@example|@sentry|@w3|privacy@|legal@|press@/i;
    for (const email of html.matchAll(emailRegex)) {
      if (!skipEmail.test(email[0])) add('email', email[0].toLowerCase());
    }

    // Phone numbers — priority 1: tel: href links (most reliable)
    const telHrefRegex = /href=["']tel:([+\d\s\-().]{7,20})["']/gi;
    for (const m of html.matchAll(telHrefRegex)) {
      const digits = m[1]!.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) {
        add('phone', m[1]!.trim());
      }
    }

    // Phone numbers — priority 2: numbers near phone keywords in visible text
    if (contacts.filter(c => c.type === 'phone').length === 0) {
      const htmlStripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      // Look for phone patterns near keywords: must be 7–15 digits, not 13+ (tracking IDs)
      const nearPhone = /(?:phone|mobile|tel|call|contact)[^\d]{0,20}(\+?[\d][\d\s\-().]{5,16}[\d])/gi;
      for (const m of htmlStripped.matchAll(nearPhone)) {
        const digits = m[1]!.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 13) {
          add('phone', m[1]!.replace(/\s+/g, ' ').trim());
        }
      }
    }

    // WhatsApp links
    const waRegex = /(?:wa\.me|whatsapp\.com\/send[?&]phone=|whatsapp:\/\/send\?phone=)([+\d]+)/g;
    for (const wa of html.matchAll(waRegex)) {
      if (wa[1]) add('whatsapp', `+${wa[1].replace(/\D/g, '')}`);
    }

    return contacts.slice(0, 10);
  }

  async importCompanies(
    companies: DiscoveredCompany[],
    options: { autoResearch: boolean; autoEmail: boolean; serviceMode?: 'ERP' | 'AEO' | 'SEO' },
  ) {
    const existing = await prisma.company.findMany({ select: { name: true } });
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

    let imported = 0;
    let skipped = 0;

    for (const c of companies) {
      if (existingNames.has(c.companyName.toLowerCase())) {
        skipped++;
        continue;
      }

      const company = await prisma.company.create({
        data: {
          name: c.companyName,
          website: c.website || undefined,
          industry: c.industry,
          country: c.region ? `${c.region}, ${c.country}` : c.country,
          employeeCount: c.estimatedEmployees,
          source: c.source === 'google' ? 'google-discovery' : c.source === 'maps' ? 'maps-discovery' : 'ai-discovery',
          status: 'NEW',
          serviceMode: options.serviceMode ?? 'ERP',
        },
      });

      existingNames.add(c.companyName.toLowerCase());

      // Create contacts from scraped data
      const emails = c.contacts.filter((ct) => ct.type === 'email');
      const phones = c.contacts.filter((ct) => ct.type === 'phone' || ct.type === 'whatsapp');

      if (emails.length > 0) {
        await prisma.contact.create({
          data: {
            companyId: company.id,
            firstName: 'Contact',
            lastName: c.companyName.split(' ')[0] ?? '',
            role: 'Operations Manager',
            email: emails[0]?.value,
            phone: phones[0]?.value,
          },
        }).catch(() => { /* ignore contact creation errors */ });
      }

      await logActivity({
        type: 'prospect.created',
        entityType: 'company',
        entityId: company.id,
        companyId: company.id,
        meta: { source: c.source, confidence: c.confidence, contacts: c.contacts.length },
      });

      if (options.autoResearch) {
        const researchQueue = getQueue(QUEUE_NAMES.RESEARCH);
        await researchQueue.add('research', { companyId: company.id }, { priority: 2, delay: imported * 3000 });
      }

      imported++;
    }

    return { imported, skipped };
  }

  async searchWithMaps(params: DiscoverySearchParams): Promise<DiscoveredCompany[]> {
    const key = await this.getSerpApiKey();
    if (key && key !== 'your-serpapi-key') {
      return this.searchMapsWithSerpApi(params, key);
    }
    return this.searchMapsWithScraper(params);
  }

  private async searchMapsWithSerpApi(params: DiscoverySearchParams, apiKey: string): Promise<DiscoveredCompany[]> {
    const serpApi = new SerpApiService(apiKey);
    const { industry, country, region, keywords, limit } = params;
    const location = region ? `${region}, ${country}` : country;
    const query = keywords
      ? `${keywords} ${industry} ${location}`
      : `${industry} manufacturer ${location}`;

    const results = await serpApi.searchMaps(query, { limit });
    logger.info('SerpAPI Maps search complete', { query, count: results.length });

    const companies: DiscoveredCompany[] = [];
    for (const r of results) {
      // Scrape website for additional email contacts (phone already comes from Maps)
      const webContacts = r.website ? await this.scrapeContacts(r.website, r.title) : [];
      const phoneContact = r.phone ? [{ type: 'phone' as const, value: r.phone }] : [];
      // Deduplicate: prefer Maps phone over scraped phone
      const emailContacts = webContacts.filter(c => c.type === 'email');
      const waContacts = webContacts.filter(c => c.type === 'whatsapp');

      companies.push({
        companyName: r.title,
        website: r.website ?? '',
        industry,
        country,
        region,
        confidence: r.rating ? Math.min(0.95, 0.6 + (r.rating / 10)) : 0.7,
        rationale: [
          r.type ? `Type: ${r.type}` : '',
          r.address ? `Address: ${r.address}` : '',
          r.rating ? `Rating: ${r.rating}/5 (${r.reviews ?? 0} reviews)` : '',
        ].filter(Boolean).join(' · '),
        contacts: [...phoneContact, ...emailContacts, ...waContacts],
        source: 'maps',
      });
    }
    return companies;
  }

  private async searchMapsWithScraper(params: DiscoverySearchParams): Promise<DiscoveredCompany[]> {
    const location = params.region ? `${params.region}, ${params.country}` : params.country;

    let scraperRes: Response;
    try {
      scraperRes = await fetch(`${SCRAPER_URL}/maps/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: params.industry, location, keywords: params.keywords, limit: params.limit }),
        signal: AbortSignal.timeout(165_000),
      });
    } catch (err) {
      logger.error('Scraper service unreachable', { err });
      throw new AppError(
        'No SerpAPI key configured and scraper service is not running.\n\nTo get real leads: add a SerpAPI key in Settings → Integrations.\nOr start the scraper: cd apps/scraper → python main.py',
        503,
      );
    }

    if (!scraperRes.ok) {
      let detail = `Scraper service error ${scraperRes.status}`;
      try {
        const body = await scraperRes.json() as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch { /* ignore */ }
      throw new AppError(detail, 502);
    }

    const json = await scraperRes.json() as { leads: MapLead[]; metrics: MapsMetrics };
    const { leads, metrics } = json;

    logger.info('Maps scrape complete', metrics);

    return leads.map((l) => ({
      companyName: l.name,
      website: l.website ?? '',
      industry: params.industry,
      country: params.country,
      region: params.region,
      estimatedEmployees: undefined,
      confidence: l.rating ? Math.min(0.95, 0.65 + (l.rating / 10)) : 0.7,
      rationale: [
        l.category ? `Category: ${l.category}` : '',
        l.address ? `Address: ${l.address}` : '',
        l.rating ? `Rating: ${l.rating}/5 (${l.review_count ?? 0} reviews)` : '',
      ].filter(Boolean).join(' · '),
      contacts: [
        ...(l.phone ? [{ type: 'phone' as const, value: l.phone }] : []),
        ...l.emails.map((e) => ({ type: 'email' as const, value: e })),
        ...l.whatsapp.map((w) => ({ type: 'whatsapp' as const, value: w })),
      ],
      source: 'maps',
    }));
  }
}

interface MapLead {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  category?: string;
  emails: string[];
  whatsapp: string[];
}

interface MapsMetrics {
  total: number;
  with_website: number;
  with_phone: number;
  with_email: number;
  pct_website: number;
  pct_phone: number;
  pct_email: number;
}
