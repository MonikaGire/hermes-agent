import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';

export class AuthController {
  private readonly authService = new AuthService();

  async register(req: Request, res: Response): Promise<void> {
    const dto = registerSchema.parse(req.body);
    const result = await this.authService.register(dto);
    sendCreated(res, result, 'Account created successfully');
  }

  async login(req: Request, res: Response): Promise<void> {
    const dto = loginSchema.parse(req.body);
    const result = await this.authService.login(dto);
    sendSuccess(res, result, 'Login successful');
  }

  async logout(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, null, 'Logged out successfully');
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await this.authService.getById(req.user!.sub);
    sendSuccess(res, user);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { token } = req.body as { token?: string };
    const result = await this.authService.refresh(token ?? '');
    sendSuccess(res, result);
  }
}
