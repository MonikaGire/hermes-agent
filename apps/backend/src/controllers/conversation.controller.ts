import type { Request, Response } from 'express';
import { ConversationService } from '../services/conversation.service.js';

const svc = new ConversationService();

export class ConversationController {
  async list(req: Request, res: Response): Promise<void> {
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const status = req.query['status'] as string | undefined;
    const intent = req.query['intent'] as string | undefined;

    const result = await svc.list({ page, limit, status, intent });
    res.json({ success: true, data: result.data, meta: { total: result.total, page, limit } });
  }

  async get(req: Request, res: Response): Promise<void> {
    const conversation = await svc.getById(req.params['id'] as string);
    res.json({ success: true, data: conversation });
  }

  async getDraft(req: Request, res: Response): Promise<void> {
    const draft = await svc.getDraftForConversation(req.params['id'] as string);
    res.json({ success: true, data: draft });
  }

  async approveDraft(req: Request, res: Response): Promise<void> {
    const { messageId, editedBody } = req.body as { messageId: string; editedBody?: string };
    const result = await svc.approveDraft(req.params['id'] as string, messageId, editedBody);
    res.json({ success: true, data: result });
  }

  async discardDraft(req: Request, res: Response): Promise<void> {
    const { messageId } = req.body as { messageId: string };
    const result = await svc.discardDraft(req.params['id'] as string, messageId);
    res.json({ success: true, data: result });
  }

  async regenerateDraft(req: Request, res: Response): Promise<void> {
    const draft = await svc.regenerateDraft(req.params['id'] as string);
    res.json({ success: true, data: draft });
  }

  async suppress(req: Request, res: Response): Promise<void> {
    const { reason } = req.body as { reason?: string };
    const result = await svc.suppress(req.params['id'] as string, reason ?? 'Manually suppressed');
    res.json({ success: true, data: result });
  }

  async stats(req: Request, res: Response): Promise<void> {
    const stats = await svc.getStats();
    res.json({ success: true, data: stats });
  }

  async pollGmail(req: Request, res: Response): Promise<void> {
    const result = await svc.pollGmail();
    res.json({ success: true, data: result, message: `Polled Gmail: ${result.processed} replies processed` });
  }

  async simulateReply(req: Request, res: Response): Promise<void> {
    const { replyBody } = req.body as { replyBody: string };
    const draft = await svc.simulateReply(req.params['id'] as string, replyBody);
    res.json({ success: true, data: draft, message: 'Reply simulated and AI draft generated' });
  }
}
