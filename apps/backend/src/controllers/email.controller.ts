import type { Request, Response } from 'express';
import { EmailService } from '../services/email.service.js';
import { sendSuccess, sendCreated, paginate } from '../utils/response.js';
import { generateEmailSchema, updateEmailSchema } from '../validators/email.validator.js';

export class EmailController {
  private readonly svc = new EmailService();

  async list(req: Request, res: Response): Promise<void> {
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const { data, total } = await this.svc.list({ page, limit, query: req.query });
    sendSuccess(res, data, { meta: paginate(total, page, limit) });
  }

  async get(req: Request, res: Response): Promise<void> {
    const data = await this.svc.getById(req.params['id'] as string);
    sendSuccess(res, data);
  }

  async generate(req: Request, res: Response): Promise<void> {
    const dto = generateEmailSchema.parse(req.body);
    const data = await this.svc.generate(dto);
    sendCreated(res, data, 'Email generated');
  }

  async send(req: Request, res: Response): Promise<void> {
    const data = await this.svc.send(req.params['id'] as string);
    sendSuccess(res, data, 'Email sent');
  }

  async regenerate(req: Request, res: Response): Promise<void> {
    const data = await this.svc.regenerate(req.params['id'] as string);
    sendSuccess(res, data, 'Email regenerated');
  }

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateEmailSchema.parse(req.body);
    const data = await this.svc.update(req.params['id'] as string, dto);
    sendSuccess(res, data, 'Email updated');
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.svc.remove(req.params['id'] as string);
    sendSuccess(res, null, 'Email deleted');
  }
}
