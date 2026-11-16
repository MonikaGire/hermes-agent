import type { AgentResult, ResearchData } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface CompanyResearchInput {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  serpResults?: {
    news: Array<{ title: string; snippet: string }>;
    expansion: Array<{ title: string; snippet: string }>;
    hiring: Array<{ title: string; snippet: string }>;
  };
  clearbitData?: {
    employees?: number;
    tech?: string[];
    description?: string;
  };
}

const SYSTEM_PROMPT = `You are an expert B2B researcher specializing in manufacturing company analysis.

Your task is to synthesize available information about a manufacturing company and extract structured intelligence useful for ERP sales outreach.

RESEARCH FOCUS:
1. Products manufactured (what do they make?)
2. Factory/warehouse locations
3. Recent news (expansions, investments, new products, leadership changes)
4. Expansion plans (new markets, new capacity, acquisitions)
5. Hiring activity (operations, supply chain, production roles signal growing complexity)
6. Technology stack (legacy systems, ERP hints, Excel-heavy = ERP opportunity)
7. Investments & funding
8. Acquisitions (multi-entity ERP complexity)
9. Pain points evidenced by the above

RULES:
- Do not guess. Base every claim on provided evidence.
- If insufficient evidence, say so clearly.
- Evidence-based assumptions are allowed when clearly labeled.
- Output valid JSON only.`;

export class CompanyResearchAgent extends BaseAgent<CompanyResearchInput, ResearchData> {
  protected readonly agentName = 'CompanyResearchAgent';

  async run(input: CompanyResearchInput): Promise<AgentResult<ResearchData>> {
    return this.wrap(async () => {
      const contextParts: string[] = [
        `Company: ${input.companyName}`,
        `Website: ${input.website}`,
        `Industry: ${input.industry}`,
        `Country: ${input.country}`,
      ];

      if (input.clearbitData) {
        if (input.clearbitData.description) {
          contextParts.push(`Description: ${input.clearbitData.description}`);
        }
        if (input.clearbitData.employees) {
          contextParts.push(`Employees: ${input.clearbitData.employees}`);
        }
        if (input.clearbitData.tech?.length) {
          contextParts.push(`Known tech: ${input.clearbitData.tech.join(', ')}`);
        }
      }

      if (input.serpResults) {
        if (input.serpResults.news.length) {
          contextParts.push('\nRecent news:');
          input.serpResults.news.forEach((n) => contextParts.push(`- ${n.title}: ${n.snippet}`));
        }
        if (input.serpResults.expansion.length) {
          contextParts.push('\nExpansion signals:');
          input.serpResults.expansion.forEach((e) => contextParts.push(`- ${e.title}: ${e.snippet}`));
        }
        if (input.serpResults.hiring.length) {
          contextParts.push('\nHiring activity:');
          input.serpResults.hiring.forEach((h) => contextParts.push(`- ${h.title}: ${h.snippet}`));
        }
      }

      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `${contextParts.join('\n')}

Analyze this company and return structured research JSON:
{
  "products": ["product 1", "product 2"],
  "locations": ["city, country"],
  "recentNews": [{"headline": "...", "date": "...", "significance": "..."}],
  "expansionPlans": ["evidence-based expansion signal"],
  "hiringActivity": ["operations hiring signal"],
  "techStack": ["known/inferred technology"],
  "investments": ["funding/investment event"],
  "acquisitions": ["acquisition event"],
  "painPoints": [
    {
      "problem": "what problem do they likely have",
      "erpCapability": "which ERP module addresses it",
      "businessOutcome": "what business result they get",
      "evidenceScore": 0.8
    }
  ],
  "summary": "3-4 sentence company summary focused on ERP relevance"
}`,
        { jsonMode: true, temperature: 0.3, maxTokens: 2500 },
      );

      return this.parseJSON<ResearchData>(content);
    });
  }
}
