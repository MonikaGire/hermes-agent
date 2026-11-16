import type { AgentResult, ReplyIntentResult } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface ReplyIntentInput {
  inboundEmailBody: string;
  conversationContext: {
    companyName: string;
    contactName: string;
    serviceMode: string;
    originalSubject: string;
    previousMessages?: Array<{ direction: string; body: string }>;
  };
}

const SYSTEM_PROMPT = `You are an expert B2B sales conversation analyst for T3 Digiport.

Your job is to read an incoming email reply and classify what the prospect is communicating, so the system can determine the correct next action.

INTENT CATEGORIES:
- INTERESTED: Shows genuine interest in learning more, asks questions about the service, wants details
- MEETING_REQUEST: Explicitly wants to schedule a call, demo, or meeting
- NOT_NOW: Not interested right now but open to future contact ("try me next quarter", "too busy right now")
- OBJECTION: Raises a specific concern (has another provider, budget constraints, not a priority, already doing this)
- INFO_REQUEST: Requests specific information — a brochure, case studies, pricing, portfolio
- QUESTION: Asks a specific question about T3's service, process, or approach
- NEGATIVE: Clearly not interested, no indication they'd want future contact
- UNSUBSCRIBE: Explicitly requests removal from contact list ("unsubscribe", "remove me", "stop emailing")
- REFERRAL: Refers sender to a different person or department
- UNCLEAR: Cannot determine intent from the text

RULES:
- If there is any ambiguity about UNSUBSCRIBE vs NEGATIVE, classify as UNSUBSCRIBE to be safe.
- confidence: 0.0–1.0 (how certain you are of the classification)
- suggestedAction: one concrete sentence describing what the sales team should do next
- For NOT_NOW: extract the requested follow-up timing if mentioned
- For REFERRAL: extract the name/role/email of the referred person if mentioned
- For OBJECTION: extract the specific objection text
- Output valid JSON only.`;

export class ReplyIntentAgent extends BaseAgent<ReplyIntentInput, ReplyIntentResult> {
  protected readonly agentName = 'ReplyIntentAgent';

  async run(input: ReplyIntentInput): Promise<AgentResult<ReplyIntentResult>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Classify this reply. Return JSON:
{
  "intent": "INTENT_CATEGORY",
  "confidence": 0.9,
  "summary": "one sentence describing what the prospect said",
  "followUpAt": "ISO date string if NOT_NOW and timing mentioned, else null",
  "referredTo": "name and role if REFERRAL, else null",
  "objectionText": "specific objection if OBJECTION, else null",
  "suggestedAction": "one sentence: what should the sales team do now?"
}`,
        { jsonMode: true, temperature: 0.3 },
      );

      return this.parseJSON<ReplyIntentResult>(content);
    });
  }

  private buildContext(input: ReplyIntentInput): string {
    const ctx = input.conversationContext;
    const parts = [
      `Company: ${ctx.companyName}`,
      `Contact: ${ctx.contactName}`,
      `Service pitched: ${ctx.serviceMode === 'aeo' ? 'AEO (Answer Engine Optimization)' : 'ERP Software'}`,
      `Original email subject: ${ctx.originalSubject}`,
    ];

    if (ctx.previousMessages?.length) {
      parts.push(`\nConversation history (${ctx.previousMessages.length} messages):`);
      for (const msg of ctx.previousMessages.slice(-4)) {
        parts.push(`[${msg.direction.toUpperCase()}]: ${msg.body.slice(0, 300)}...`);
      }
    }

    parts.push(`\nIncoming reply to classify:\n---\n${input.inboundEmailBody}\n---`);
    return parts.join('\n');
  }
}
