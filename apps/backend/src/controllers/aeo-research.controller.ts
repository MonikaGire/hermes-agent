import type { Request, Response } from 'express';
import { AEOResearchService } from '../services/aeo-research.service.js';
import { sendSuccess } from '../utils/response.js';

export class AEOResearchController {
  private readonly svc = new AEOResearchService();

  async get(req: Request, res: Response): Promise<void> {
    const data = await this.svc.getByCompanyId(req.params['companyId'] as string);
    sendSuccess(res, data);
  }

  async run(req: Request, res: Response): Promise<void> {
    const data = await this.svc.run(req.params['companyId'] as string);
    sendSuccess(res, data, 'AEO research completed');
  }
}
