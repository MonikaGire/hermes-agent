import type { Request, Response } from 'express';
import { z } from 'zod';
import { WaitlistService } from '../services/waitlist.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const ingestSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  source: z.string().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.enum(['PENDING', 'SENT', 'REJECTED']).optional(),
  search: z.string().optional(),
});

const svc = new WaitlistService();

export class WaitlistController {
  async ingest(req: Request, res: Response): Promise<void> {
    // API key check
    const apiKey = req.headers['x-api-key'];
    const expected = process.env['WAITLIST_API_KEY'];
    if (expected && apiKey !== expected) throw new AppError('Invalid API key', 401);

    const data = ingestSchema.parse(req.body);
    const result = await svc.ingest(data);
    sendCreated(res, result.lead, result.created ? 'Lead added to waitlist' : 'Already on waitlist');
  }

  async list(req: Request, res: Response): Promise<void> {
    const opts = listSchema.parse(req.query);
    const result = await svc.list(opts);
    sendSuccess(res, result);
  }

  async stats(req: Request, res: Response): Promise<void> {
    const result = await svc.stats();
    sendSuccess(res, result);
  }

  async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await svc.approve(id);
    sendSuccess(res, result, 'Email sent successfully');
  }

  async approveAll(req: Request, res: Response): Promise<void> {
    const result = await svc.approveAll();
    sendSuccess(res, result, `Sent ${result.sent} emails`);
  }

  async reject(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await svc.reject(id);
    sendSuccess(res, result, 'Lead rejected');
  }

  async importCsv(req: Request, res: Response): Promise<void> {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const csvText = req.file.buffer.toString('utf-8');
    const source = (req.body as { source?: string }).source ?? 'csv-import';
    const result = await svc.importCsv(csvText, source);
    sendCreated(res, result, `Imported ${result.imported} leads (${result.skipped} duplicates skipped)`);
  }

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await svc.delete(id);
    sendSuccess(res, null, 'Lead deleted');
  }

  async convertToProspect(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const serviceMode = (req.body as { serviceMode?: 'ERP' | 'AEO' | 'SEO' }).serviceMode ?? 'ERP';
    const result = await svc.convertToProspect(id, serviceMode);
    sendSuccess(res, result, 'Lead added to pipeline');
  }

  async convertAll(req: Request, res: Response): Promise<void> {
    const serviceMode = (req.body as { serviceMode?: 'ERP' | 'AEO' | 'SEO' }).serviceMode ?? 'ERP';
    const result = await svc.convertAllToProspects(serviceMode);
    sendSuccess(res, result, `${result.converted} leads added to pipeline`);
  }
}
