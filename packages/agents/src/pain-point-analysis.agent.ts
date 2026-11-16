import type { AgentResult, PainPoint, ResearchData } from '@hermes/shared';
import { PAIN_POINT_MAP, ERP_CAPABILITIES } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface PainPointAnalysisInput {
  research: ResearchData;
  industry: string;
  companySize?: number;
  targetContact?: string;
}

export interface PainPointAnalysisOutput {
  painPoints: PainPoint[];
  primaryFocus: PainPoint;
  emailAngle: string;
  relevantCapabilities: string[];
}

const SYSTEM_PROMPT = `You are a manufacturing ERP pain point specialist.

Your task is to analyze company research and identify the most compelling business pain points that our ERP system can address.

ERP Capabilities available:
${Object.entries(ERP_CAPABILITIES).map(([_, v]) => `- ${v}`).join('\n')}

Pain Point Mapping Reference:
${Object.entries(PAIN_POINT_MAP).map(([problem, { capability, outcome }]) =>
  `- "${problem}" → ${capability} → ${outcome}`
).join('\n')}

RULES:
1. Only surface pain points with evidence from the research. No guessing.
2. Rank pain points by evidence quality and business impact.
3. Primary focus = highest confidence + highest business impact.
4. Business outcomes must be specific and quantifiable where possible.
5. Email angle must be one sentence that connects their situation to an ERP outcome.
6. Never mention the ERP product name — focus on the outcome.
7. Output valid JSON only.`;

export class PainPointAnalysisAgent extends BaseAgent<PainPointAnalysisInput, PainPointAnalysisOutput> {
  protected readonly agentName = 'PainPointAnalysisAgent';

  async run(input: PainPointAnalysisInput): Promise<AgentResult<PainPointAnalysisOutput>> {
    return this.wrap(async () => {
      const researchSummary = [
        `Industry: ${input.industry}`,
        `Employees: ${input.companySize ?? 'unknown'}`,
        `Summary: ${input.research.summary}`,
        `Products: ${input.research.products.join(', ')}`,
        `Locations: ${input.research.locations.join(', ')}`,
        `Expansion: ${input.research.expansionPlans.join('; ')}`,
        `Hiring: ${input.research.hiringActivity.join('; ')}`,
        `Tech: ${input.research.techStack.join(', ')}`,
        `Existing pain points from research: ${JSON.stringify(input.research.painPoints)}`,
      ].join('\n');

      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${researchSummary}

Analyze and rank pain points. Return JSON:
{
  "painPoints": [
    {
      "problem": "specific problem statement",
      "erpCapability": "ERP module name",
      "businessOutcome": "measurable business outcome",
      "evidenceScore": 0.85
    }
  ],
  "primaryFocus": {
    "problem": "...",
    "erpCapability": "...",
    "businessOutcome": "...",
    "evidenceScore": 0.9
  },
  "emailAngle": "one compelling sentence connecting their situation to an ERP outcome",
  "relevantCapabilities": ["capability 1", "capability 2"]
}`,
        { jsonMode: true, temperature: 0.3 },
      );

      const result = this.parseJSON<PainPointAnalysisOutput>(content);

      // Sort pain points by evidence score
      result.painPoints.sort((a, b) => b.evidenceScore - a.evidenceScore);

      return result;
    });
  }
}
