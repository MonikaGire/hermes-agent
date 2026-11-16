import type { AgentResult, GeneratedEmail, AEOResearchData } from '@hermes/shared';
import { countWords, EMAIL_WORD_MIN, EMAIL_WORD_MAX, BANNED_PHRASES, T3_AEO_KNOWLEDGE } from '@hermes/shared';
import type { AEOOpportunity } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface AEOEmailWriterInput {
  contactName: string;
  contactRole: string;
  companyName: string;
  industry: string;
  country: string;
  research: AEOResearchData;
  primaryOpportunity: AEOOpportunity;
  emailAngle: string;
  tone?: 'professional' | 'casual' | 'direct';
  previousVersions?: string[];
}

const SYSTEM_PROMPT = `You are writing B2B cold outreach emails for T3 Digiport, an AEO (Answer Engine Optimization) agency based in Pune, India.

ABOUT T3 DIGIPORT'S AEO SERVICE:
${T3_AEO_KNOWLEDGE.shortDescription}
Key points:
${T3_AEO_KNOWLEDGE.keyPoints.map((p) => `- ${p}`).join('\n')}

WRITING RULES:
1. Length: ${EMAIL_WORD_MIN}–${EMAIL_WORD_MAX} words. Never exceed ${EMAIL_WORD_MAX}.
2. Human tone — write like a smart person, not a marketing template.
3. Structure: Specific observation → Why it matters commercially → What T3 can do → Soft CTA
4. Opening: Reference something real and specific about their online presence or category.
5. Never claim rankings, traffic numbers, or AI positions you cannot verify.
6. CTA must be a soft question — never pushy. Make it easy to say yes to a conversation.
7. Subject line: under 8 words. No emojis. Curiosity-driving.
8. Sender is ${T3_AEO_KNOWLEDGE.senderName}, ${T3_AEO_KNOWLEDGE.senderTitle}.
9. Sign off naturally — no "Best regards" corporate endings.

AEO-SPECIFIC RULES:
- Mention AI tools (ChatGPT, Perplexity, Gemini) naturally — these are real things buyers use.
- The value proposition is: "Your competitors may be getting found when buyers ask AI tools. Here's what we'd look at."
- Never use the word "algorithm" or "SEO" in an AEO email.
- Never promise guaranteed rankings or results.
- Treat this as starting a conversation, not closing a sale.

BANNED PHRASES:
${BANNED_PHRASES.map((p) => `- "${p}"`).join('\n')}

Output valid JSON only.`;

export class AEOEmailWriterAgent extends BaseAgent<AEOEmailWriterInput, GeneratedEmail> {
  protected readonly agentName = 'AEOEmailWriterAgent';

  async run(input: AEOEmailWriterInput): Promise<AgentResult<GeneratedEmail>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Write the AEO cold outreach email. Return JSON:
{
  "subject": "subject line under 8 words",
  "body": "full email body, plain text, no HTML. Sign off as ${T3_AEO_KNOWLEDGE.senderName}.",
  "reviewScores": {
    "researchRelevance": 0,
    "personalization": 0,
    "humanTone": 0,
    "businessValue": 0,
    "replyProbability": 0,
    "overall": 0
  },
  "wordCount": 0
}

After writing, self-score (1–10 each). overall = average. Set wordCount to actual word count of body.`,
        { jsonMode: true, temperature: 0.75 },
      );

      const email = this.parseJSON<GeneratedEmail>(content);
      email.wordCount = countWords(email.body);
      return email;
    });
  }

  private buildContext(input: AEOEmailWriterInput): string {
    const parts = [
      `Contact: ${input.contactName} (${input.contactRole}) at ${input.companyName}`,
      `Industry: ${input.industry}, ${input.country}`,
      `AEO Research Summary: ${input.research.summary}`,
      `AI Visibility: ${input.research.appearsInAIAnswers ? 'Currently appearing in AI answers' : 'Not currently appearing in AI answers'}`,
      `Competitor AI Presence: ${input.research.competitorAIPresence.slice(0, 2).join(', ') || 'unknown'}`,
      `Top FAQ Gaps: ${input.research.faqContentGaps.slice(0, 2).join('; ') || 'not assessed'}`,
      `Primary AEO Opportunity: ${input.primaryOpportunity.area} — ${input.primaryOpportunity.observation}`,
      `Recommended Action: ${input.primaryOpportunity.recommendation}`,
      `Email Angle: ${input.emailAngle}`,
      `Tone: ${input.tone ?? 'professional'}`,
    ];

    if (input.previousVersions?.length) {
      parts.push(`\nPrevious drafts to avoid repeating:\n${input.previousVersions.join('\n---\n')}`);
    }

    return parts.join('\n');
  }
}
