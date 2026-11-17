import type { AgentResult, ConversationReply, ConversationContext } from '@hermes/shared';
import { T3_AEO_KNOWLEDGE, T3_SEO_KNOWLEDGE, BANNED_PHRASES } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

const ERP_BRIEF = `T3 Digiport provides both standard and fully customised ERP for metal-processing and manufacturing operations.
Potential areas include dimensions/grades/location-aware stock, full sheets and usable offcuts,
quotations and purchasing, jobs/WIP, production, cost visibility and traceability.
Mention a feature only if it is supported by the documented product capabilities supplied with the case.
Do not assume a prospect wants to replace their existing ERP. Discuss integration or a targeted workflow where appropriate.`;

function serviceKnowledge(mode: ConversationContext['serviceMode']): string {
  if (mode === 'erp') return ERP_BRIEF;
  if (mode === 'seo') return 'T3 Digiport offers SEO services. ' + T3_SEO_KNOWLEDGE.shortDescription;
  return 'T3 Digiport offers AEO services. ' + T3_AEO_KNOWLEDGE.shortDescription;
}

const SYSTEM_PROMPT = `You are an assistant drafting a B2B sales representative's response on behalf of T3 Digiport.
Write naturally and concisely (ideally 50–100 words), with no marketing fluff.
You must answer the actual question or objection, not sell unrelated services.
Do not fabricate product features, case studies, pricing, timelines, testimonials, availability or meeting links.
Do not claim to be a human or conceal that an assistant helps draft messages.
Use only known service capabilities and confirmed thread facts. If information is missing, ask one concise question or flag it for sales review.
If the prospect says no, respect the answer; do not try to overcome it.
For an explicit unsubscribe or a definitive rejection, generate no outbound message.
For scheduling, propose a next step without fabricating calendar slots.
Sign as T3 Digiport unless a sender's identity has been supplied elsewhere.
Avoid: ${BANNED_PHRASES.join(', ')}.
Respond with JSON only.`;

export class ConversationReplyAgent extends BaseAgent<ConversationContext, ConversationReply> {
  protected readonly agentName = 'ConversationReplyAgent';

  async run(input: ConversationContext): Promise<AgentResult<ConversationReply>> {
    return this.wrap(async () => {
      if (input.intent === 'UNSUBSCRIBE' || input.intent === 'NEGATIVE') {
        throw new Error('No reply draft permitted for suppressed or rejecting prospects');
      }
      const context = this.buildContext(input);
      const followUpInstruction = input.draftPurpose === 'scheduled_follow_up'
        ? '\nThis is a follow-up draft to be reviewed by a human, only because the prospect previously invited contact at this time. Do NOT write a fresh pitch. Refer to the actual prior exchange and reason; ask one simple question whether revisiting this is useful now. Never pretend you sent an earlier follow-up or invent a date, meeting time, or product result.'
        : '';
      const { content } = await this.chat(
        SYSTEM_PROMPT + '\nSERVICE KNOWLEDGE:\n' + serviceKnowledge(input.serviceMode) + followUpInstruction,
        `${context}

Write the reply. Return JSON:
{
  "subject": "Re: [original subject] or a new subject if needed",
  "body": "the full reply text, plain text, natural, signed as T3 Digiport",
  "rationale": "one sentence explaining why you responded this way",
  "suggestedFollowUpDays": null
}

For NOT_NOW: set suggestedFollowUpDays to the appropriate number.
For NEGATIVE or UNSUBSCRIBE: no draft must be generated.`,
        { jsonMode: true, temperature: 0.7 },
      );

      return this.parseJSON<ConversationReply>(content);
    });
  }

  private buildContext(input: ConversationContext): string {
    const parts = [
      `Prospect: ${input.contactName} (${input.contactRole}) at ${input.companyName}`,
      `Service: ${input.serviceMode.toUpperCase()}`,
      `Draft purpose: ${input.draftPurpose ?? 'inbound_reply'}`,
      ...(input.followUpReason ? [`Documented follow-up reason: ${input.followUpReason}`] : []),
      `Verified company context (may contain unverified assumptions; never state them as facts): ${input.researchSummary}`,
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
