import type { Request, Response } from 'express';
import { ApprovalService } from '../services/approval.service.js';
import { sendSuccess, paginate } from '../utils/response.js';

export class ApprovalController {
  private readonly svc = new ApprovalService();

  async list(req: Request, res: Response): Promise<void> {
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const { data, total } = await this.svc.list({ page, limit });
    sendSuccess(res, data, { meta: paginate(total, page, limit) });
  }

  async pending(_req: Request, res: Response): Promise<void> {
    const data = await this.svc.getPending();
    sendSuccess(res, data);
  }

  async approve(req: Request, res: Response): Promise<void> {
    const data = await this.svc.approve(req.params['emailId'] as string, req.user!.sub);
    sendSuccess(res, data, 'Email approved');
  }

  async skip(req: Request, res: Response): Promise<void> {
    const { reason } = req.body as { reason?: string };
    const data = await this.svc.skip(req.params['emailId'] as string, req.user!.sub, reason);
    sendSuccess(res, data, 'Email skipped');
  }

  async revise(req: Request, res: Response): Promise<void> {
    const { instructions } = req.body as { instructions?: string };
    const data = await this.svc.revise(req.params['emailId'] as string, instructions ?? '');
    sendSuccess(res, data, 'Email revision queued');
  }
}
