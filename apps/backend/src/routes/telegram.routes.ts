import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

// Webhook endpoint for Telegram (no auth — verified by Telegram token header)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { getTelegramBot } = await import('../bot/telegram.js');
    const bot = getTelegramBot();
    if (bot) {
      await bot.handleUpdate(req.body);
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(500);
  }
});

export { router as telegramRouter };
