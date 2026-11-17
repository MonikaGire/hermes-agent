import type { Request, Response } from 'express';
import { DiscoveryService } from '../services/discovery.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { z } from 'zod';

const searchSchema = z.object({
  industry: z.string().min(1),
  country: z.string().min(1),
  region: z.string().optional(),
  keywords: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

const importSchema = z.object({
  companies: z.array(z.object({
    companyName: z.string(),
    website: z.string().optional().default(''),
    industry: z.string(),
    country: z.string(),
    region: z.string().optional(),
    estimatedEmployees: z.number().optional(),
    confidence: z.number(),
    rationale: z.string(),
    contacts: z.array(z.object({
      type: z.enum(['email', 'phone', 'whatsapp']),
      value: z.string(),
      label: z.string().optional(),
    })),
    source: z.enum(['google', 'ai', 'maps']),
    sourceUrl: z.string().url().optional(),
    sourcePublishedAt: z.string().optional(),
    signalType: z.enum(['software_selection', 'operational_pain']).optional(),
    verification: z.literal('search_excerpt').optional(),
  })),
  autoResearch: z.boolean().default(false),
  autoEmail: z.boolean().default(false),
  serviceMode: z.enum(['ERP', 'AEO', 'SEO']).default('ERP'),
});

const evidenceReviewSchema = z.object({
  sourceUrl: z.string().url(),
  evidenceText: z.string().trim().min(25).max(2000),
  observedAt: z.string().min(10),
  signalType: z.enum(['software_selection', 'operational_pain']),
  vendorAlreadySelected: z.boolean(),
});

const scrapeSchema = z.object({
  website: z.string().url(),
  companyName: z.string().optional().default(''),
});

const mapsSearchSchema = z.object({
  industry: z.string().min(1),
  country: z.string().min(1),
  region: z.string().optional(),
  keywords: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export class DiscoveryController {
  private readonly svc = new DiscoveryService();

  async search(req: Request, res: Response): Promise<void> {
    const params = searchSchema.parse(req.body);
    const results = await this.svc.search(params);
    sendSuccess(res, results, `Found ${results.length} companies`);
  }

  async scrape(req: Request, res: Response): Promise<void> {
    const { website, companyName } = scrapeSchema.parse(req.body);
    const contacts = await this.svc.scrapeContacts(website, companyName);
    sendSuccess(res, contacts);
  }

  async import(req: Request, res: Response): Promise<void> {
    const { companies, autoResearch, autoEmail, serviceMode } = importSchema.parse(req.body);
    const result = await this.svc.importCompanies(companies, { autoResearch, autoEmail, serviceMode });
    sendCreated(res, result, `Imported ${result.imported} companies (${result.skipped} skipped)`);
  }

  async mapsSearch(req: Request, res: Response): Promise<void> {
    const params = mapsSearchSchema.parse(req.body);
    const results = await this.svc.searchWithMaps(params);
    sendSuccess(res, results, `Found ${results.length} companies via Google Maps`);
  }
  async reviewEvidence(req: Request, res: Response): Promise<void> {
    const payload = evidenceReviewSchema.parse(req.body);
    const data = await this.svc.reviewErpEvidence({
      companyId: req.params['companyId'] as string,
      reviewerId: req.user!.sub,
      ...payload,
    });
    sendSuccess(res, data, 'ERP evidence reviewed');
  }
}
