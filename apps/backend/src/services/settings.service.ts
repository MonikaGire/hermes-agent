import { prisma } from '@hermes/database';
import type { Prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { EmailSenderService } from '../integrations/email-sender.service.js';

export class SettingsService {
  private readonly emailSender = new EmailSenderService();

  async get() {
    const settings = await prisma.setting.findMany();
    const map: Record<string, unknown> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }

  async update(data: Record<string, unknown>) {
    await prisma.$transaction(
      Object.entries(data).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue },
          create: { key, value: value as Prisma.InputJsonValue },
        }),
      ),
    );
    return this.get();
  }

  async testEmailConfig(to: string) {
    if (!to) throw new AppError('Recipient email required', 400);
    const ok = await this.emailSender.verify();
    if (!ok) throw new AppError('SMTP configuration is invalid', 500);
    await this.emailSender.sendTest(to);
  }

  async testOpenAI() {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    try {
      const models = await client.models.list();
      return { connected: true, models: models.data.length };
    } catch {
      throw new AppError('OpenAI connection failed', 500);
    }
  }
}
