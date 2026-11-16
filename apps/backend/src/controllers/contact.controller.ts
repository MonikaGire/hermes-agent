import type { Request, Response } from 'express';
import { ContactService } from '../services/contact.service.js';
import { sendSuccess, sendCreated, paginate } from '../utils/response.js';
import { createContactSchema, updateContactSchema } from '../validators/contact.validator.js';

export class ContactController {
  private readonly svc = new ContactService();

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

  async create(req: Request, res: Response): Promise<void> {
    const dto = createContactSchema.parse(req.body);
    const data = await this.svc.create(dto);
    sendCreated(res, data, 'Contact created');
  }

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateContactSchema.parse(req.body);
    const data = await this.svc.update(req.params['id'] as string, dto);
    sendSuccess(res, data, 'Contact updated');
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.svc.remove(req.params['id'] as string);
    sendSuccess(res, null, 'Contact deleted');
  }

  async enrich(req: Request, res: Response): Promise<void> {
    const data = await this.svc.enrich(req.params['id'] as string);
    sendSuccess(res, data, 'Contact enriched');
  }
}
