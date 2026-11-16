import type { AgentResult, GeneratedEmail, ResearchData } from '@hermes/shared';
import { countWords, EMAIL_WORD_MIN, EMAIL_WORD_MAX, BANNED_PHRASES, T3_SEO_KNOWLEDGE } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface SEOEmailWriterInput {
  contactName: string;
  contactRole: string;
  companyName: string;
  website: string;
  industry: string;
  country: string;
  research: ResearchData;
  tone?: 'professional' | 'casual' | 'direct';
  previousVersions?: string[];
}

const SYSTEM_PROMPT = `You are writing B2B cold outreach emails for T3 Digiport, an SEO agency based in Pune, India.

ABOUT T3 DIGIPORT'S SEO SERVICE:
${T3_SEO_KNOWLEDGE.shortDescription}
Key points:
${T3_SEO_KNOWLEDGE.keyPoints.map((p) => `- ${p}`).join('\n')}

WRITING RULES:
1. Length: ${EMAIL_WORD_MIN}–${EMAIL_WORD_MAX} words. Never exceed ${EMAIL_WORD_MAX}.
2. Human tone — write like a smart person, not a marketing template.
3. Structure: Specific observation about their online presence → Why organic search matters for their business → What T3 can do → Soft CTA
4. Opening: Reference something real about their website, industry, or competitors' search visibility.
5. Never claim specific traffic numbers or rankings you cannot verify.
6. CTA must be a soft question — never pushy. Make it easy to say yes to a quick conversation.
7. Subject line: under 8 words. No emojis. Curiosity-driving.
8. Sender is ${T3_SEO_KNOWLEDGE.senderName}, ${T3_SEO_KNOWLEDGE.senderTitle}.
9. Sign off naturally — no "Best regards" corporate endings.

SEO-SPECIFIC RULES:
- Mention organic search, Google rankings, and buyer-intent keywords naturally.
- The value proposition: "Your competitors may be ranking for searches your buyers are doing right now."
- Focus on business outcomes (more inbound leads, lower cost per acquisition) not technical jargon.
- Avoid buzzwords like "algorithm", "SERP hacking", or "link juice".
- Never promise guaranteed first-page rankings.
- Treat this as starting a conversation, not closing a sale.

BANNED PHRASES:
${BANNED_PHRASES.map((p) => `- "${p}"`).join('\n')}

Output valid JSON only.`;

export class SEOEmailWriterAgent extends BaseAgent<SEOEmailWriterInput, GeneratedEmail> {
  protected readonly agentName = 'SEOEmailWriterAgent';

  async run(input: SEOEmailWriterInput): Promise<AgentResult<GeneratedEmail>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Write the SEO cold outreach email. Return JSON:
{
  "subject": "subject line under 8 words",
  "body": "full email body, plain text, no HTML. Sign off as ${T3_SEO_KNOWLEDGE.senderName}.",
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

  private buildContext(input: SEOEmailWriterInput): string {
    const parts = [
      `Contact: ${input.contactName} (${input.contactRole}) at ${input.companyName}`,
      `Website: ${input.website || 'not provided'}`,
      `Industry: ${input.industry}, ${input.country}`,
      `Company summary: ${input.research.summary}`,
      `Products/services: ${input.research.products.join(', ')}`,
    ];

    if (input.research.expansionPlans.length) {
      parts.push(`Growth signals: ${input.research.expansionPlans[0]}`);
    }

    if (input.research.hiringActivity.length) {
      parts.push(`Hiring activity: ${input.research.hiringActivity[0]}`);
    }

    if (input.research.recentNews?.length) {
      const firstNews = input.research.recentNews[0];
      if (firstNews) parts.push(`Recent news: ${firstNews}`);
    }

    parts.push(`Tone: ${input.tone ?? 'professional'}`);

    if (input.previousVersions?.length) {
      parts.push(`\nPrevious drafts to avoid repeating:\n${input.previousVersions.join('\n---\n')}`);
    }

    return parts.join('\n');
  }
}
