import type { AgentResult, AEOResearchData } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface AEOResearchInput {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  serpResults?: {
    aiMentions: Array<{ title: string; snippet: string }>;
    faqContent: Array<{ title: string; snippet: string }>;
    competitors: Array<{ title: string; snippet: string }>;
  };
}

const SYSTEM_PROMPT = `You are an AEO (Answer Engine Optimization) research specialist working for T3 Digiport.

AEO is about getting a brand to appear when people ask ChatGPT, Gemini, Perplexity, or other AI tools for recommendations in their category.

Your job is to analyze a company's online presence and identify:
1. Whether they currently appear in AI-generated answers for their category
2. Whether their competitors are appearing instead
3. What content/structural gaps make them invisible to AI engines
4. What FAQ, schema, or content opportunities exist

RESEARCH DIMENSIONS:
1. AI Visibility — would ChatGPT/Gemini cite this company if asked about their service category?
2. Competitor AI Presence — are rivals appearing instead?
3. FAQ Gaps — are there common questions buyers ask that this company does not answer?
4. Schema Markup — do they use structured data (FAQPage, LocalBusiness, Service, etc.)?
5. Brand Entity Strength — is the brand consistently described online (Wikipedia, directories, authoritative sites)?
6. Content Extractability — can AI tools pull clean, citable answers from their website?
7. Conversion Content — do they have testimonials, case studies, and trust signals AI tools value?

RULES:
- Base every finding on evidence. If you cannot verify from available data, say "insufficient evidence" for that dimension.
- Opportunity score: 0–100. Higher = more urgent AEO need.
- Primary opportunity: the single most impactful area T3 Digiport can help with.
- Output valid JSON only.`;

export class AEOResearchAgent extends BaseAgent<AEOResearchInput, AEOResearchData> {
  protected readonly agentName = 'AEOResearchAgent';

  async run(input: AEOResearchInput): Promise<AgentResult<AEOResearchData>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Analyze this company's AEO profile. Return JSON:
{
  "appearsInAIAnswers": false,
  "aiAnswerEvidence": ["evidence string or 'No evidence found'"],
  "competitorAIPresence": ["competitor name or domain that likely appears instead"],
  "faqContentGaps": ["question buyers commonly ask that this company does not answer"],
  "schemaMarkupStatus": "none|partial|good — with brief note",
  "brandMentions": ["authoritative sources mentioning the brand"],
  "contentQualityNotes": ["observations about content extractability"],
  "opportunities": [
    {
      "area": "FAQ Optimization",
      "observation": "what we observed",
      "recommendation": "what T3 Digiport would do",
      "impactScore": 85
    }
  ],
  "primaryOpportunity": "single most impactful opportunity in one sentence",
  "opportunityScore": 72,
  "summary": "2–3 sentence summary of AEO profile and biggest opportunity"
}`,
        { jsonMode: true, temperature: 0.5 },
      );

      return this.parseJSON<AEOResearchData>(content);
    });
  }

  private buildContext(input: AEOResearchInput): string {
    const parts = [
      `Company: ${input.companyName}`,
      `Website: ${input.website}`,
      `Industry: ${input.industry}`,
      `Country: ${input.country}`,
    ];

    if (input.serpResults) {
      if (input.serpResults.aiMentions.length) {
        parts.push(
          `AI mention signals:\n${input.serpResults.aiMentions
            .slice(0, 3)
            .map((r) => `  - ${r.title}: ${r.snippet}`)
            .join('\n')}`,
        );
      }
      if (input.serpResults.faqContent.length) {
        parts.push(
          `FAQ/Q&A content found:\n${input.serpResults.faqContent
            .slice(0, 3)
            .map((r) => `  - ${r.title}: ${r.snippet}`)
            .join('\n')}`,
        );
      }
      if (input.serpResults.competitors.length) {
        parts.push(
          `Competitor signals:\n${input.serpResults.competitors
            .slice(0, 3)
            .map((r) => `  - ${r.title}: ${r.snippet}`)
            .join('\n')}`,
        );
      }
    }

    return parts.join('\n');
  }
}
