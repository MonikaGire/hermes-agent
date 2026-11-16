import type { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';

export class DashboardController {
  private readonly svc = new DashboardService();

  async stats(_req: Request, res: Response): Promise<void> {
    const data = await this.svc.getStats();
    sendSuccess(res, data);
  }

  async activity(req: Request, res: Response): Promise<void> {
    const limit = Number(req.query['limit'] ?? 20);
    const data = await this.svc.getRecentActivity(limit);
    sendSuccess(res, data);
  }

  async conversion(_req: Request, res: Response): Promise<void> {
    const data = await this.svc.getConversionStats();
    sendSuccess(res, data);
  }
}
