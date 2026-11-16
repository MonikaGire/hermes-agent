import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  handleWhatsAppIncoming,
  sendPendingApprovalsToWhatsApp,
  isWhatsAppConfigured,
  type WhatsAppWebhookBody,
} from '../bot/whatsapp.js';
import { logger } from '../config/logger.js';

const router = Router();

// Twilio sends application/x-www-form-urlencoded — express.urlencoded handles this
// Responds with TwiML so Twilio can relay the reply back to the sender
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const reply = await handleWhatsAppIncoming(req.body as WhatsAppWebhookBody);
    const escaped = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.set('Content-Type', 'text/xml');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    );
  } catch (err) {
    logger.error('WhatsApp webhook error', { err });
    res.status(500).set('Content-Type', 'text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    );
  }
});

// Push pending approvals to a phone number — called from the frontend
router.post('/notify', async (req: Request, res: Response) => {
  const { phoneNumber } = req.body as { phoneNumber?: string };
  if (!phoneNumber) {
    res.status(400).json({ success: false, message: 'phoneNumber is required' });
    return;
  }
  if (!isWhatsAppConfigured()) {
    res.status(503).json({ success: false, message: 'WhatsApp not configured' });
    return;
  }
  const sent = await sendPendingApprovalsToWhatsApp(phoneNumber);
  res.json({ success: true, sent });
});

// Status — used by the frontend to show connection state
router.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: isWhatsAppConfigured() });
});

export { router as whatsappRouter };
