import type { Request, Response } from 'express';
import { ResearchService } from '../services/research.service.js';
import { sendSuccess, paginate } from '../utils/response.js';

export class ResearchController {
  private readonly svc = new ResearchService();

  async list(req: Request, res: Response): Promise<void> {
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const { data, total } = await this.svc.list({ page, limit });
    sendSuccess(res, data, { meta: paginate(total, page, limit) });
  }

  async get(req: Request, res: Response): Promise<void> {
    const data = await this.svc.getByCompanyId(req.params['companyId'] as string);
    sendSuccess(res, data);
  }

  async run(req: Request, res: Response): Promise<void> {
    const result = await this.svc.runResearch(req.params['companyId'] as string);
    const message = result.mode === 'sync' ? 'Research completed' : 'Research queued';
    sendSuccess(res, result, message);
  }
}
