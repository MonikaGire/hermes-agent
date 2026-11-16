import type { AgentResult, ConversationReply, ConversationContext } from '@hermes/shared';
import { T3_AEO_KNOWLEDGE, BANNED_PHRASES } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

const SYSTEM_PROMPT = `You are an experienced B2B sales professional representing T3 Digiport.

T3 Digiport offers AEO (Answer Engine Optimization) and SEO services for businesses.

ABOUT T3:
${T3_AEO_KNOWLEDGE.shortDescription}

YOUR JOB:
Read a prospect's email reply, understand exactly what they said, and write a natural, intelligent response.

RESPONSE PRINCIPLES:
1. You are a real person, not a bot. Write accordingly.
2. Address exactly what the prospect said — do not sidestep their message.
3. If they asked a question, answer it directly.
4. If they raised an objection, acknowledge it genuinely, then explore whether there's still value.
5. If they said "not now", acknowledge with grace, note the timing, and end warmly.
6. If they said "not interested" or "remove me", say a professional farewell. Nothing more.
7. If they want a meeting, suggest specific next steps — don't just say "let's chat".
8. If they want info, send relevant, specific information — not a generic brochure request.
9. Never be pushy. One soft follow-up question maximum.
10. Never pretend you personally researched their website this morning unless it's true.
11. Keep it short — 60–120 words. Nobody wants a wall of text in reply to a reply.

BANNED PHRASES:
${BANNED_PHRASES.map((p) => `- "${p}"`).join('\n')}

Additional banned for replies: "as I mentioned", "per my previous email", "circling back", "just wanted to follow up"

Output valid JSON only.`;

export class ConversationReplyAgent extends BaseAgent<ConversationContext, ConversationReply> {
  protected readonly agentName = 'ConversationReplyAgent';

  async run(input: ConversationContext): Promise<AgentResult<ConversationReply>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Write the reply. Return JSON:
{
  "subject": "Re: [original subject] or a new subject if needed",
  "body": "the full reply text, plain text, natural, signed as ${T3_AEO_KNOWLEDGE.senderName}",
  "rationale": "one sentence explaining why you responded this way",
  "suggestedFollowUpDays": null
}

For NOT_NOW: set suggestedFollowUpDays to the appropriate number.
For NEGATIVE or UNSUBSCRIBE: body should be a graceful goodbye, nothing else.`,
        { jsonMode: true, temperature: 0.7 },
      );

      return this.parseJSON<ConversationReply>(content);
    });
  }

  private buildContext(input: ConversationContext): string {
    const parts = [
      `Prospect: ${input.contactName} (${input.contactRole}) at ${input.companyName}`,
      `Industry: ${input.serviceMode === 'aeo' ? 'AEO target' : 'ERP target'}`,
      `Company AEO context: ${input.researchSummary}`,
      ...(input.primaryOpportunity ? [`Primary opportunity: ${input.primaryOpportunity}`] : []),
      `\nOriginal email sent:`,
      `Subject: ${input.originalEmail.subject}`,
      `Body: ${input.originalEmail.body}`,
      `\nConversation thread (${input.thread.length} messages):`,
      ...input.thread.map(
        (m) => `[${m.direction.toUpperCase()} — ${m.sentAt}]:\n${m.body.slice(0, 400)}`,
      ),
      `\nProspect's intent: ${input.intent}`,
      `Intent summary: ${input.intentDetails.summary}`,
      ...(input.intentDetails.objectionText
        ? [`Specific objection: ${input.intentDetails.objectionText}`]
        : []),
      ...(input.intentDetails.referredTo
        ? [`Referred to: ${input.intentDetails.referredTo}`]
        : []),
    ];
    return parts.join('\n');
  }
}
