import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: string;
  accepted: string[];
}

export class EmailSenderService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = process.env['SMTP_HOST'];
    if (!host) throw new AppError('SMTP not configured', 500);

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env['SMTP_PORT'] ?? 587),
      secure: process.env['SMTP_SECURE'] === 'true',
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
    });

    return this.transporter;
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const transporter = this.getTransporter();
    const from = options.from ?? process.env['SMTP_FROM'] ?? process.env['SMTP_USER'];

    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html.replace(/<[^>]*>/g, ''),
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      references: options.references,
    });

    logger.info('Email sent', { to: options.to, subject: options.subject, messageId: info.messageId });

    return {
      messageId: info.messageId,
      provider: 'smtp',
      accepted: info.accepted as string[],
    };
  }

  async verify(): Promise<boolean> {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  async sendTest(to: string): Promise<void> {
    await this.send({
      to,
      subject: 'HERMES Test Email',
      html: '<h1>HERMES</h1><p>Your email configuration is working correctly.</p>',
    });
  }
}
