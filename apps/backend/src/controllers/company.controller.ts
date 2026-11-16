import type { Request, Response } from 'express';
import { CompanyService } from '../services/company.service.js';
import { sendSuccess, sendCreated, paginate } from '../utils/response.js';
import { createCompanySchema, updateCompanySchema } from '../validators/company.validator.js';

export class CompanyController {
  private readonly svc = new CompanyService();

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
    const dto = createCompanySchema.parse(req.body);
    const data = await this.svc.create(dto);
    sendCreated(res, data, 'Company created');
  }

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateCompanySchema.parse(req.body);
    const data = await this.svc.update(req.params['id'] as string, dto);
    sendSuccess(res, data, 'Company updated');
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.svc.remove(req.params['id'] as string);
    sendSuccess(res, null, 'Company deleted');
  }
}
