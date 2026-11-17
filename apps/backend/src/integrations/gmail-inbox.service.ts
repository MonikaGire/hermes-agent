import { google } from 'googleapis';
import { logger } from '../config/logger.js';

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedAt: Date;
  inReplyTo?: string;
  rfcMessageId?: string;
  references?: string[];
}

/**
 * Polls Gmail inbox for new replies to sent campaign emails.
 * Uses OAuth2 with credentials stored in environment variables.
 * Requires GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 */
export class GmailInboxService {
  private readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = !!(
      process.env['GMAIL_CLIENT_ID'] &&
      process.env['GMAIL_CLIENT_SECRET'] &&
      process.env['GMAIL_REFRESH_TOKEN']
    );
  }

  private getOAuth2Client() {
    const oauth2 = new google.auth.OAuth2(
      process.env['GMAIL_CLIENT_ID'],
      process.env['GMAIL_CLIENT_SECRET'],
      'urn:ietf:wg:oauth:2.0:oob',
    );
    oauth2.setCredentials({ refresh_token: process.env['GMAIL_REFRESH_TOKEN'] });
    return oauth2;
  }

  /**
   * Fetch incoming replies since a checkpoint with pagination.
   * A search/index error must propagate so the caller does not advance the
   * checkpoint past replies that were not processed.
   *
   * Do not require unread: a teammate may read a reply before Hermes polls.
   * Persisted Gmail message IDs make overlap/replays safe.
   */
  async fetchNewReplies(sinceTimestamp: Date): Promise<GmailMessage[]> {
    if (!this.isConfigured) {
      throw new Error('Gmail OAuth credentials are not configured; inbox checkpoint was not advanced');
    }

    const auth = this.getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });
    const sinceUnix = Math.floor(sinceTimestamp.getTime() / 1000);
    const query = 'in:inbox after:' + sinceUnix;

    let pageToken: string | undefined;
    const messages: GmailMessage[] = [];
    const seen = new Set<string>();
    let pageCount = 0;

    do {
      const listRes = await gmail.users.messages.list({
        userId: 'me', q: query, maxResults: 100, pageToken,
      });
      pageCount++;
      for (const item of listRes.data.messages ?? []) {
        if (!item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        // Fail closed rather than silently lose a message in the batch.
        const response = await gmail.users.messages.get({
          userId: 'me', id: item.id, format: 'full',
        });
        const parsed = this.parseMessage(response.data);
        if (parsed && (parsed.inReplyTo || parsed.references?.length)) {
          messages.push(parsed);
        }
      }
      pageToken = listRes.data.nextPageToken ?? undefined;
      if (pageToken && pageCount >= 5) {
        throw new Error('Inbox poll reached the 500-message safety cap; checkpoint retained for retry');
      }
    } while (pageToken);

    return messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  /**
   * Mark a Gmail message as read after processing.
   */
  async markAsRead(gmailMessageId: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      const auth = this.getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.messages.modify({
        userId: 'me',
        id: gmailMessageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    } catch (err) {
      logger.error('GmailInboxService: markAsRead failed', { gmailMessageId, error: err });
    }
  }

  /**
   * Send a reply email via Gmail API (preserving thread).
   */
  async sendReply(options: {
    to: string;
    subject: string;
    body: string;
    threadId: string;
    inReplyTo: string;
  }): Promise<{ gmailMessageId: string; gmailThreadId: string } | null> {
    if (!this.isConfigured) {
      logger.warn('GmailInboxService: Gmail not configured — cannot send reply');
      return null;
    }
    try {
      const auth = this.getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });

      const from = process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? '';
      if (!/^<[^<>\r\n]+@[^<>\r\n]+>$/.test(options.inReplyTo.trim())) {
        throw new Error('Gmail reply requires an RFC Message-ID, not a Gmail thread ID');
      }
      const rawMessage = this.buildRawMessage({
        from,
        to: options.to,
        subject: options.subject,
        body: options.body,
        inReplyTo: options.inReplyTo,
        references: options.inReplyTo,
      });

      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage,
          threadId: options.threadId,
        },
      });

      return {
        gmailMessageId: sent.data.id ?? '',
        gmailThreadId: sent.data.threadId ?? options.threadId,
      };
    } catch (err) {
      logger.error('GmailInboxService: sendReply failed', { error: err });
      return null;
    }
  }

  /** Resolve the RFC Message-ID of an existing Gmail message for proper threading. */
  async getRfcMessageId(gmailMessageId: string): Promise<string | null> {
    if (!this.isConfigured || !gmailMessageId) return null;
    try {
      const auth = this.getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: gmailMessageId,
        format: 'metadata',
        metadataHeaders: ['Message-ID'],
      });
      return response.data.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === 'message-id',
      )?.value ?? null;
    } catch (error) {
      logger.warn('Unable to resolve RFC Message-ID for Gmail reply', { gmailMessageId, error });
      return null;
    }
  }

  async verify(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      const auth = this.getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private parseMessage(msg: any): GmailMessage | null {
    try {
      const headers: Record<string, string> = {};
      for (const h of (msg.payload?.headers ?? [])) {
        headers[h.name.toLowerCase()] = h.value;
      }

      const body = this.extractBody(msg.payload);
      if (!body) return null;

      const receivedAt = msg.internalDate
        ? new Date(Number(msg.internalDate))
        : new Date();

      const references = headers['references']
        ? headers['references'].split(/\s+/).filter(Boolean)
        : undefined;

      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: headers['subject'] ?? '(no subject)',
        from: headers['from'] ?? '',
        to: headers['to'] ?? '',
        body,
        receivedAt,
        inReplyTo: headers['in-reply-to'] ?? undefined,
        rfcMessageId: headers['message-id'] ?? undefined,
        references,
      };
    } catch {
      return null;
    }
  }

  private extractBody(payload: any): string {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractBody(part);
        if (text) return text;
      }
    }

    return '';
  }

  private buildRawMessage(opts: {
    from: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo: string;
    references: string;
  }): string {
    const lines = [
      `From: ${opts.from.replace(/[\r\n]/g, ' ')}`,
      `To: ${opts.to.replace(/[\r\n]/g, ' ')}`,
      `Subject: ${opts.subject.replace(/[\r\n]/g, ' ')}`
      `In-Reply-To: ${opts.inReplyTo}`,
      `References: ${opts.references}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      opts.body,
    ];
    return Buffer.from(lines.join('\r\n')).toString('base64url');
  }
}
