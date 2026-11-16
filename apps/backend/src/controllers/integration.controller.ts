import type { Request, Response } from 'express';
import { prisma } from '@hermes/database';
import { sendSuccess } from '../utils/response.js';

const PROVIDERS = ['openai', 'serpapi', 'apollo', 'hunter', 'clearbit', 'smtp', 'telegram'] as const;
type Provider = typeof PROVIDERS[number];

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export class IntegrationController {
  async list(_req: Request, res: Response): Promise<void> {
    const rows = await prisma.integration.findMany({ orderBy: { provider: 'asc' } });
    const data = rows.map((r) => {
      const cfg = r.config as Record<string, string> | null ?? {};
      const hasKey = !!(cfg['apiKey'] && cfg['apiKey'] !== '');
      return {
        provider: r.provider,
        isActive: r.isActive,
        hasKey,
        maskedKey: hasKey ? maskKey(cfg['apiKey']!) : null,
      };
    });
    sendSuccess(res, data);
  }

  async update(req: Request, res: Response): Promise<void> {
    const provider = req.params['provider'] as Provider;
    if (!PROVIDERS.includes(provider)) {
      res.status(400).json({ success: false, message: 'Unknown provider' });
      return;
    }

    const { apiKey } = req.body as { apiKey?: string };

    const current = await prisma.integration.findUnique({ where: { provider } });
    const currentConfig = (current?.config as Record<string, string> | null) ?? {};

    const newConfig = apiKey !== undefined
      ? { ...currentConfig, apiKey: apiKey.trim() }
      : currentConfig;

    const isActive = !!(newConfig['apiKey'] && newConfig['apiKey'] !== '');

    const updated = await prisma.integration.upsert({
      where: { provider },
      update: { config: newConfig, isActive },
      create: { provider, config: newConfig, isActive },
    });

    const cfg = updated.config as Record<string, string>;
    sendSuccess(res, {
      provider: updated.provider,
      isActive: updated.isActive,
      hasKey: isActive,
      maskedKey: isActive ? maskKey(cfg['apiKey']!) : null,
    }, 'Integration updated');
  }

  async testSerpApi(_req: Request, res: Response): Promise<void> {
    const row = await prisma.integration.findUnique({ where: { provider: 'serpapi' } });
    const cfg = (row?.config as Record<string, string> | null) ?? {};
    const key = cfg['apiKey'] ?? process.env['SERPAPI_KEY'] ?? '';

    if (!key) {
      res.status(400).json({ success: false, message: 'No SerpAPI key configured' });
      return;
    }

    const { SerpApiService } = await import('../integrations/serpapi.service.js');
    const svc = new SerpApiService(key);
    const results = await svc.search('manufacturing company USA', { num: 2 });
    sendSuccess(res, { connected: true, resultCount: results.length }, 'SerpAPI connected');
  }
}
