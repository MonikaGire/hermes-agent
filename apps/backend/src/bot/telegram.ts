import { Telegraf, Markup } from 'telegraf';
import { prisma } from '@hermes/database';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';
import { logger } from '../config/logger.js';

let bot: Telegraf | null = null;

export function getTelegramBot(): Telegraf | null {
  return bot;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export async function initTelegramBot(): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, Telegram bot disabled');
    return;
  }

  bot = new Telegraf(token);

  // /start
  bot.start((ctx) =>
    ctx.replyWithMarkdownV2(
      `*HERMES AI* 🚀\n\nManufacturing ERP Sales Automation\n\nCommands:\n/stats \\- Dashboard overview\n/find \\- Discover prospects\n/approve \\- Review pending emails\n/research \\<company\\> \\- Research a company\n/email \\<id\\> \\- Generate email for prospect`,
    ),
  );

  // /help
  bot.help((ctx) =>
    ctx.reply(
      'Available commands:\n\n' +
      '/stats - Dashboard statistics\n' +
      '/find - Discover new prospects\n' +
      '/research <company name> - Research a company\n' +
      '/approve - Show pending approval queue\n' +
      '/revise <email_id> - Request revision\n' +
      '/skip <email_id> - Skip an email\n' +
      '/alternatives <email_id> - Generate alternatives',
    ),
  );

  // /stats
  bot.command('stats', async (ctx) => {
    try {
      const [totalProspects, emailsSent, emailsPending, conversions] = await Promise.all([
        prisma.company.count(),
        prisma.email.count({ where: { status: 'SENT' } }),
        prisma.email.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.company.count({ where: { status: 'CONVERTED' } }),
      ]);

      await ctx.replyWithMarkdownV2(
        `*HERMES Dashboard*\n\n` +
        `📊 Total Prospects: *${totalProspects}*\n` +
        `📨 Emails Sent: *${emailsSent}*\n` +
        `⏳ Pending Approval: *${emailsPending}*\n` +
        `✅ Conversions: *${conversions}*`,
      );
    } catch (err) {
      await ctx.reply('Failed to fetch stats. Please try again.');
    }
  });

  // /approve — show pending queue
  bot.command('approve', async (ctx) => {
    try {
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
        await ctx.reply('No emails pending approval.');
        return;
      }

      for (const email of pending) {
        const contactName = email.contact
          ? `${email.contact.firstName} ${email.contact.lastName} (${email.contact.role})`
          : 'Unknown contact';

        const preview = email.body.slice(0, 300) + (email.body.length > 300 ? '...' : '');

        await ctx.reply(
          `📧 ${email.company.name}\nTo: ${contactName}\nSubject: ${email.subject}\n\n${preview}`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(`✅ Approve`, `approve:${email.id}`),
              Markup.button.callback(`⏭ Skip`, `skip:${email.id}`),
            ],
            [Markup.button.callback(`✏️ Revise`, `revise:${email.id}`)],
          ]),
        );
      }
    } catch (err) {
      await ctx.reply('Failed to fetch approval queue.');
    }
  });

  // /find
  bot.command('find', async (ctx) => {
    const queue = getQueue(QUEUE_NAMES.PROSPECT_DISCOVERY);
    await queue.add('discover', {
      industries: ['Electronics', 'Packaging', 'Plastics'],
      countries: ['USA', 'UK'],
      limit: 10,
    });
    await ctx.reply('Prospect discovery job queued. I\'ll notify you when new prospects are found.');
  });

  // /research <company>
  bot.command('research', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!args) {
      await ctx.reply('Usage: /research <company name>');
      return;
    }

    const company = await prisma.company.findFirst({
      where: { name: { contains: args, mode: 'insensitive' } },
    });

    if (!company) {
      await ctx.reply(`Company "${args}" not found. Add it first via the web dashboard.`);
      return;
    }

    const queue = getQueue(QUEUE_NAMES.RESEARCH);
    await queue.add('research', { companyId: company.id });
    await ctx.reply(`Research job queued for ${company.name}.`);
  });

  // /skip <id>
  bot.command('skip', async (ctx) => {
    const emailId = ctx.message.text.split(' ')[1];
    if (!emailId) {
      await ctx.reply('Usage: /skip <email_id>');
      return;
    }

    try {
      await prisma.email.update({ where: { id: emailId }, data: { status: 'SKIPPED' } });
      await ctx.reply(`Email ${emailId} skipped.`);
    } catch {
      await ctx.reply('Email not found.');
    }
  });

  // Inline button callbacks
  bot.action(/^approve:(.+)$/, async (ctx) => {
    const emailId = ctx.match[1];
    try {
      await prisma.email.update({ where: { id: emailId }, data: { status: 'APPROVED' } });
      await ctx.editMessageText(`✅ Email approved and queued for sending.`);
      await ctx.answerCbQuery('Approved!');
    } catch {
      await ctx.answerCbQuery('Failed to approve.');
    }
  });

  bot.action(/^skip:(.+)$/, async (ctx) => {
    const emailId = ctx.match[1];
    try {
      await prisma.email.update({ where: { id: emailId }, data: { status: 'SKIPPED' } });
      await ctx.editMessageText(`⏭ Email skipped.`);
      await ctx.answerCbQuery('Skipped');
    } catch {
      await ctx.answerCbQuery('Failed to skip.');
    }
  });

  bot.action(/^revise:(.+)$/, async (ctx) => {
    const emailId = ctx.match[1];
    const queue = getQueue(QUEUE_NAMES.EMAIL_GENERATION);
    await queue.add('revise', { emailId, instructions: 'General revision - improve tone and personalization' });
    await ctx.editMessageText(`✏️ Revision queued for email ${emailId}.`);
    await ctx.answerCbQuery('Revision queued');
  });

  const webhookUrl = process.env['TELEGRAM_WEBHOOK_URL'];
  if (webhookUrl && process.env['NODE_ENV'] === 'production') {
    await bot.telegram.setWebhook(`${webhookUrl}/api/telegram/webhook`);
    logger.info('Telegram webhook set', { url: webhookUrl });
  } else {
    void bot.launch();
    logger.info('Telegram bot started (long polling)');
  }

  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));
}
