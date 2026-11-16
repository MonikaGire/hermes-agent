import type { AgentResult, AEOResearchData, AEOOpportunity } from '@hermes/shared';
import { AEO_CAPABILITIES, AEO_OPPORTUNITY_MAP } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface AEOOpportunityInput {
  research: AEOResearchData;
  industry: string;
  companySize?: number;
}

export interface AEOOpportunityOutput {
  opportunities: AEOOpportunity[];
  primaryFocus: AEOOpportunity;
  emailAngle: string;
  relevantCapabilities: string[];
}

const SYSTEM_PROMPT = `You are an AEO strategy specialist for T3 Digiport.

Your task: take AEO research findings and identify the strongest commercial opportunity to lead with in a cold outreach email.

AEO Capabilities T3 Digiport offers:
${Object.entries(AEO_CAPABILITIES).map(([_, v]) => `- ${v}`).join('\n')}

AEO Opportunity Reference:
${Object.entries(AEO_OPPORTUNITY_MAP).map(([trigger, { capability, outcome }]) =>
  `- "${trigger}" → ${capability} → ${outcome}`
).join('\n')}

RULES:
1. Only surface opportunities backed by research evidence.
2. Rank by: evidence quality × business impact × relevance to T3's capabilities.
3. Primary focus = highest confidence + highest commercial impact.
4. Email angle = one sentence connecting their specific situation to an AEO outcome T3 can deliver.
5. Be concrete — reference what was actually found in research.
6. Output valid JSON only.`;

export class AEOOpportunityAgent extends BaseAgent<AEOOpportunityInput, AEOOpportunityOutput> {
  protected readonly agentName = 'AEOOpportunityAgent';

  async run(input: AEOOpportunityInput): Promise<AgentResult<AEOOpportunityOutput>> {
    return this.wrap(async () => {
      const context = this.buildContext(input);
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${context}

Identify AEO opportunities. Return JSON:
{
  "opportunities": [
    {
      "area": "FAQ Optimization",
      "observation": "what we found",
      "recommendation": "what T3 Digiport would do",
      "impactScore": 85
    }
  ],
  "primaryFocus": {
    "area": "top opportunity area",
    "observation": "specific observation",
    "recommendation": "specific recommendation",
    "impactScore": 90
  },
  "emailAngle": "one sentence connecting their situation to an AEO outcome",
  "relevantCapabilities": ["capability names from the list above"]
}`,
        { jsonMode: true, temperature: 0.5 },
      );

      return this.parseJSON<AEOOpportunityOutput>(content);
    });
  }

  private buildContext(input: AEOOpportunityInput): string {
    const r = input.research;
    const parts = [
      `Industry: ${input.industry}`,
      ...(input.companySize ? [`Company size: ~${input.companySize} employees`] : []),
      `AI Visibility: ${r.appearsInAIAnswers ? 'Yes — appears in AI answers' : 'No — not found in AI answers'}`,
      `AI Evidence: ${r.aiAnswerEvidence.join('; ') || 'none'}`,
      `Competitor AI Presence: ${r.competitorAIPresence.join(', ') || 'unknown'}`,
      `FAQ Gaps: ${r.faqContentGaps.slice(0, 4).join('; ') || 'not assessed'}`,
      `Schema Markup: ${r.schemaMarkupStatus || 'unknown'}`,
      `Brand Mentions: ${r.brandMentions.slice(0, 3).join(', ') || 'limited'}`,
      `Content Notes: ${r.contentQualityNotes.slice(0, 3).join('; ') || 'none'}`,
      `Research Summary: ${r.summary}`,
      `Opportunity Score from Research: ${r.opportunityScore}/100`,
    ];
    return parts.join('\n');
  }
}
