import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import { logActivity } from './activity.service.js';
import { logger } from '../config/logger.js';
import { SerpApiService } from '../integrations/serpapi.service.js';
import { ProspectFinderAgent, publicCompanyDomain } from '@hermes/agents';

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
  sourceUrl?: string;
  sourcePublishedAt?: string;
  signalType?: 'software_selection' | 'operational_pain';
  verification?: 'search_excerpt';
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
    if (!key || key === 'your-serpapi-key') {
      // Never substitute model memory for live prospect discovery.
      throw new AppError('A live SerpAPI integration is required for evidence-based discovery. Configure it in Settings → Integrations.', 503);
    }
    return this.searchWithGoogle(params, key);
  }

  private async searchWithGoogle(params: DiscoverySearchParams, apiKey: string): Promise<DiscoveredCompany[]> {
    const serpApi = new SerpApiService(apiKey);
    const { industry, country, region, keywords, limit } = params;
    const location = region ? region + ', ' + country : country;
    // Search for the situation, not a directory of manufacturers.
    const queries = keywords
      ? [keywords + ' ' + industry + ' ' + location]
      : [
          industry + ' ' + location + ' "ERP" "implementation" factory',
          industry + ' ' + location + ' "Excel" "inventory" manufacturing',
          industry + ' ' + location + ' "stock reconciliation" production',
          industry + ' ' + location + ' "job costing" "manual"',
          industry + ' ' + location + ' "offcuts" "inventory"',
        ];

    const batches = await Promise.allSettled(
      queries.map((q) => serpApi.search(q, { num: Math.min(limit * 2, 20) })),
    );
    const evidence = batches.flatMap((batch) => {
      if (batch.status !== 'fulfilled') return [];
      return batch.value.flatMap((result) => {
        const domain = publicCompanyDomain(result.link);
        if (!domain) return [];
        // A job board or industry listing is not the employer's official domain.
        // Require the domain's brand to appear in a title segment before even considering it.
        const brand = domain.split('.')[0]!.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (brand.length < 4) return [];
        const parts = result.title.split(/\s+[|–—-]\s+/).map((p) => p.trim());
        const name = parts.find((p) => p.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(brand));
        if (!name || name.length < 3 || name.length > 130) return [];
        return [{
          companyName: name,
          website: 'https://' + domain,
          sourceUrl: result.link,
          title: result.title,
          excerpt: result.snippet,
          ...(result.date ? { publishedAt: result.date } : {}),
        }];
      });
    });

    const found = await this.finderAgent.run({
      industry, country, limit, searchEvidence: evidence,
    });
    if (!found.success || !found.data) {
      logger.warn('Evidence-first discovery returned no candidates', { reason: found.error });
      return [];
    }

    // Candidates are REVIEW-ONLY; a search excerpt is not first-party verified intent.
    return found.data.map((candidate) => ({
      companyName: candidate.companyName,
      website: candidate.website,
      industry: candidate.industry,
      country,
      region,
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      contacts: [],
      source: 'google' as const,
      sourceUrl: candidate.sourceUrl,
      sourcePublishedAt: candidate.sourcePublishedAt,
      signalType: candidate.signalType,
      verification: candidate.verification,
    }));
  }

  /**
   * Explicit first-party verification by an authenticated teammate.
   * Do not mistake an LLM score or search snippet for verified buying intent.
   */
  async reviewErpEvidence(input: {
    companyId: string;
    reviewerId: string;
    sourceUrl: string;
    evidenceText: string;
    observedAt: string;
    signalType: 'software_selection' | 'operational_pain';
    vendorAlreadySelected: boolean;
  }) {
    const company = await prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company || company.serviceMode !== 'ERP') {
      throw new AppError('ERP company not found', 404);
    }
    const companyDomain = company.website ? publicCompanyDomain(company.website) : null;
    if (!companyDomain || publicCompanyDomain(input.sourceUrl) !== companyDomain) {
      throw new AppError('Review requires a URL hosted on the verified company website.', 400);
    }
    const observed = new Date(input.observedAt);
    if (Number.isNaN(observed.getTime()) || observed.getTime() > Date.now() ||
      observed.getTime() < Date.now() - 365 * 86_400_000) {
      throw new AppError('Evidence date must be valid and within the last 365 days.', 400);
    }
    if (input.vendorAlreadySelected) {
      throw new AppError('An already-committed software project cannot be verified as an open ERP opportunity.', 400);
    }

    await logActivity({
      type: 'prospect.evidence_reviewed',
      entityType: 'company',
      entityId: company.id,
      companyId: company.id,
      userId: input.reviewerId,
      meta: {
        sourceUrl: input.sourceUrl,
        evidenceText: input.evidenceText,
        observedAt: observed.toISOString(),
        signalType: input.signalType,
        vendorAlreadySelected: false,
        reviewStatus: 'approved_for_research',
      },
    });

    return { companyId: company.id, reviewStatus: 'approved_for_research' };
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
    const existing = await prisma.company.findMany({ select: { name: true, website: true } });
    const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    const existingDomains = new Set(existing.map((c) => c.website ? publicCompanyDomain(c.website) : null).filter(Boolean));

    let imported = 0;
    let skipped = 0;

    for (const c of companies) {
      const companyDomain = c.website ? publicCompanyDomain(c.website) : null;
      if (!companyDomain || existingDomains.has(companyDomain) || existingNames.has(c.companyName.trim().toLowerCase())) {
        skipped++;
        continue;
      }
      // For ERP discovery never import unsourced web results as qualified leads.
      if ((options.serviceMode ?? 'ERP') === 'ERP' &&
          c.source === 'google' && (!c.sourceUrl || !c.signalType)) {
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
          source: c.source === 'google' ? 'google-discovery-unverified' : c.source === 'maps' ? 'maps-discovery' : 'legacy-ai-discovery',
          sourceId: c.sourceUrl,
          status: 'NEW',
          serviceMode: options.serviceMode ?? 'ERP',
        },
      });

      existingNames.add(c.companyName.trim().toLowerCase());
      existingDomains.add(companyDomain);

      // Website emails are generic routing addresses, not verified decision-makers.
      // Keep them in evidence metadata; don't fabricate a named Operations Manager.
      await logActivity({
        type: 'prospect.created',
        entityType: 'company',
        entityId: company.id,
        companyId: company.id,
        meta: {
          source: c.source,
          confidence: c.confidence,
          contactCandidates: c.contacts,
          sourceUrl: c.sourceUrl ?? null,
          sourcePublishedAt: c.sourcePublishedAt ?? null,
          signalType: c.signalType ?? null,
          verification: c.verification ?? 'unverified',
          reviewStatus: 'needs_review',
        },
      });

      if (c.sourceUrl && c.signalType) {
        await logActivity({
          type: 'prospect.evidence',
          entityType: 'company',
          entityId: company.id,
          companyId: company.id,
          meta: {
            sourceUrl: c.sourceUrl,
            excerpt: c.rationale.slice(0, 600),
            signalType: c.signalType,
            publishedAt: c.sourcePublishedAt ?? null,
            verification: c.verification ?? 'search_excerpt',
            reviewed: false,
          },
        });
      }

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
