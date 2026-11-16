import axios from 'axios';
import { prisma } from '@hermes/database';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import { logger } from '../config/logger.js';

export interface WhatsAppWebhookBody {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
}

export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env['TWILIO_ACCOUNT_SID'] &&
    process.env['TWILIO_AUTH_TOKEN'] &&
    process.env['WHATSAPP_FROM_NUMBER']
  );
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  const from = `whatsapp:${process.env['WHATSAPP_FROM_NUMBER']}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    new URLSearchParams({ From: from, To: toNumber, Body: body }).toString(),
    {
      auth: { username: accountSid!, password: authToken! },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
}

// Returns a TwiML-safe reply string for incoming WhatsApp messages
export async function handleWhatsAppIncoming(webhookBody: WhatsAppWebhookBody): Promise<string> {
  const text = (webhookBody.Body ?? '').trim();
  const lower = text.toLowerCase();
  const parts = lower.split(/\s+/);
  const command = parts[0];
  const arg = parts[1];

  try {
    switch (command) {
      case 'stats': {
        const [totalProspects, emailsSent, emailsPending, conversions] = await Promise.all([
          prisma.company.count(),
          prisma.email.count({ where: { status: 'SENT' } }),
          prisma.email.count({ where: { status: 'PENDING_APPROVAL' } }),
          prisma.company.count({ where: { status: 'CONVERTED' } }),
        ]);
        return (
          `HERMES Dashboard\n\n` +
          `Prospects: ${totalProspects}\n` +
          `Emails Sent: ${emailsSent}\n` +
          `Pending Approval: ${emailsPending}\n` +
          `Conversions: ${conversions}`
        );
      }

      case 'list': {
        const pending = await prisma.email.findMany({
          where: { status: 'PENDING_APPROVAL' },
          take: 5,
          orderBy: { createdAt: 'asc' },
          include: {
            company: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
          },
        });

        if (pending.length === 0) return 'No emails pending approval.';

        const lines = pending.map((e, i) => {
          const contact = e.contact
            ? `${e.contact.firstName} ${e.contact.lastName}`
            : 'Unknown';
          const shortId = e.id.slice(-8);
          return `${i + 1}. ${e.company.name} -> ${contact}\n   ID: ${shortId}\n   Subject: ${e.subject}`;
        });

        return (
          `Pending Approvals (${pending.length})\n\n` +
          lines.join('\n\n') +
          `\n\nReply:\n` +
          `approve <id>\nskip <id>\nrevise <id> <notes>`
        );
      }

      case 'approve': {
        if (!arg) return 'Usage: approve <email_id>';
        const email = await prisma.email.findFirst({
          where: { id: { endsWith: arg } },
          include: { company: { select: { name: true } } },
        });
        if (!email) return `Email ending in "${arg}" not found.`;
        await prisma.email.update({ where: { id: email.id }, data: { status: 'APPROVED' } });
        return `Email approved and queued for sending.\nCompany: ${email.company.name}`;
      }

      case 'skip': {
        if (!arg) return 'Usage: skip <email_id>';
        const email = await prisma.email.findFirst({ where: { id: { endsWith: arg } } });
        if (!email) return `Email ending in "${arg}" not found.`;
        await prisma.email.update({ where: { id: email.id }, data: { status: 'SKIPPED' } });
        return `Email skipped.`;
      }

      case 'revise': {
        if (!arg) return 'Usage: revise <email_id> <instructions>';
        const instructions =
          text.split(/\s+/).slice(2).join(' ') ||
          'General revision - improve tone and personalization';
        const email = await prisma.email.findFirst({ where: { id: { endsWith: arg } } });
        if (!email) return `Email ending in "${arg}" not found.`;
        const queue = getQueue(QUEUE_NAMES.EMAIL_GENERATION);
        await queue.add('revise', { emailId: email.id, instructions });
        return `Revision queued.\nInstructions: ${instructions}`;
      }

      case 'help':
      default:
        return (
          `HERMES AI Bot\n\nCommands:\n` +
          `stats - Dashboard overview\n` +
          `list - Show pending approvals\n` +
          `approve <id> - Approve an email\n` +
          `skip <id> - Skip an email\n` +
          `revise <id> <notes> - Request revision\n` +
          `help - Show this message`
        );
    }
  } catch (err) {
    logger.error('WhatsApp command error', { err, text });
    return 'An error occurred. Please try again.';
  }
}

// Push up to 5 pending approval emails to a phone number via Twilio
export async function sendPendingApprovalsToWhatsApp(toNumber: string): Promise<number> {
  const pending = await prisma.email.findMany({
    where: { status: 'PENDING_APPROVAL' },
    take: 5,
    orderBy: { createdAt: 'asc' },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  if (pending.length === 0) {
    await sendWhatsAppMessage(toNumber, 'No emails pending approval right now.');
    return 0;
  }

  for (const email of pending) {
    const contact = email.contact
      ? `${email.contact.firstName} ${email.contact.lastName} (${email.contact.role})`
      : 'Unknown contact';
    const preview = email.body.slice(0, 280) + (email.body.length > 280 ? '...' : '');
    const shortId = email.id.slice(-8);

    const msg =
      `${email.company.name}\n` +
      `To: ${contact}\n` +
      `Subject: ${email.subject}\n\n` +
      `${preview}\n\n` +
      `Reply:\napprove ${shortId}\nskip ${shortId}\nrevise ${shortId} <notes>`;

    await sendWhatsAppMessage(toNumber, msg);
  }

  logger.info('WhatsApp: pushed pending approvals', { count: pending.length, to: toNumber });
  return pending.length;
}
