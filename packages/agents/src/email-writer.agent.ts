import type { AgentResult, GeneratedEmail, ResearchData, PainPoint } from '@hermes/shared';
import { countWords, EMAIL_WORD_MIN, EMAIL_WORD_MAX, BANNED_PHRASES } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface EmailWriterInput {
  contactName: string;
  contactRole: string;
  companyName: string;
  industry: string;
  country: string;
  research: ResearchData;
  primaryPainPoint: PainPoint;
  emailAngle: string;
  tone?: 'professional' | 'casual' | 'direct';
  previousVersions?: string[];
}

const SYSTEM_PROMPT = `You are an expert B2B cold email writer specializing in manufacturing ERP sales.

WRITING RULES:
1. Length: ${EMAIL_WORD_MIN}–${EMAIL_WORD_MAX} words. Never exceed ${EMAIL_WORD_MAX}.
2. Human tone. Write like a real person, not a marketing bot.
3. Structure: Opening → Observation → Insight → ERP angle → Soft CTA
4. Opening: Reference something specific and real about their company.
5. Never mention competitor ERPs.
6. Never use generic openers. Each email must be genuinely personalized.
7. CTA must be a question or soft ask, never pushy.
8. Subject line: under 8 words. No emojis. No "Quick question" opener.

BANNED PHRASES (never use any of these):
${BANNED_PHRASES.map((p) => `- "${p}"`).join('\n')}

BUSINESS OUTCOME FOCUS:
- Never say "our ERP has feature X"
- Always say "companies in [industry] doing X typically see [outcome]"
- Numbers are powerful when evidence-based

Output valid JSON only.`;

export class EmailWriterAgent extends BaseAgent<EmailWriterInput, GeneratedEmail> {
  protected readonly agentName = 'EmailWriterAgent';

  async run(input: EmailWriterInput): Promise<AgentResult<GeneratedEmail>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Write a cold outreach email. Return JSON:
{
  "subject": "compelling subject line under 8 words",
  "body": "the full email body, plain text, no HTML",
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

After writing, self-score the email in reviewScores (1-10 each). Calculate overall as average.
Then set wordCount to the actual word count of the body.`,
        { jsonMode: true, temperature: 0.75 },
      );

      const email = this.parseJSON<GeneratedEmail>(content);
      email.wordCount = countWords(email.body);

      return email;
    });
  }

  private buildContext(input: EmailWriterInput): string {
    const parts = [
      `Contact: ${input.contactName} (${input.contactRole}) at ${input.companyName}`,
      `Industry: ${input.industry}, ${input.country}`,
      `Company summary: ${input.research.summary}`,
      `Products they make: ${input.research.products.join(', ')}`,
    ];

    if (input.research.expansionPlans.length) {
      parts.push(`Expansion signals: ${input.research.expansionPlans[0]}`);
    }

    if (input.research.hiringActivity.length) {
      parts.push(`Hiring activity: ${input.research.hiringActivity[0]}`);
    }

    parts.push(
      `Primary pain point: ${input.primaryPainPoint.problem}`,
      `ERP angle: ${input.primaryPainPoint.erpCapability}`,
      `Business outcome: ${input.primaryPainPoint.businessOutcome}`,
      `Email angle: ${input.emailAngle}`,
      `Tone: ${input.tone ?? 'professional'}`,
    );

    if (input.previousVersions?.length) {
      parts.push(`\nPrevious versions to avoid similarity with:\n${input.previousVersions.join('\n---\n')}`);
    }

    return parts.join('\n');
  }
}
