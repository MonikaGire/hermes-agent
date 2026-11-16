import type { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service.js';
import { sendSuccess } from '../utils/response.js';

export class SettingsController {
  private readonly svc = new SettingsService();

  async get(_req: Request, res: Response): Promise<void> {
    const data = await this.svc.get();
    sendSuccess(res, data);
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = await this.svc.update(req.body as Record<string, unknown>);
    sendSuccess(res, data, 'Settings updated');
  }

  async testEmail(req: Request, res: Response): Promise<void> {
    const { to } = req.body as { to: string };
    await this.svc.testEmailConfig(to);
    sendSuccess(res, null, 'Test email sent');
  }

  async testOpenAI(_req: Request, res: Response): Promise<void> {
    const result = await this.svc.testOpenAI();
    sendSuccess(res, result, 'OpenAI connection verified');
  }
}
