import type { AgentResult } from '@hermes/shared';
import { COMPANY_SIZE_MIN, COMPANY_SIZE_MAX } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface ProspectFinderInput {
  industry: string;
  country: string;
  companySizeMin?: number;
  companySizeMax?: number;
  limit?: number;
  existingCompanies?: string[];
}

export interface ProspectCandidate {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  estimatedEmployees?: number;
  confidence: number;
  rationale: string;
}

const SYSTEM_PROMPT = `You are a B2B prospect research specialist. Your task is to recall REAL, EXISTING manufacturing companies from your training knowledge.

CRITICAL — READ CAREFULLY:
- Only list companies that ACTUALLY EXIST in the real world
- You must have encountered the company in real business data, industry directories, news, or company websites during training
- The website must be the company's REAL official domain — never invent or guess a URL
- Do NOT hallucinate or invent company names under any circumstances
- If you are not confident a company is real and verifiable, omit it entirely
- Prefer companies with a strong web presence (LinkedIn, Glassdoor, industry association membership)
- Set confidence = 0.9+ only for companies you are very certain exist; 0.75–0.89 for companies you believe exist but are less sure about; never go below 0.75

Target profile:
- Industries: Electronics, Packaging, Plastics, Medical devices, Chemicals, Machinery, Food manufacturing
- Countries: USA, UK, Australia, Singapore
- Company size: 20–500 employees (mid-market manufacturers, NOT Fortune 500 or micro businesses)
- Decision makers: CEO, COO, Operations Director, Manufacturing Director, IT Director

EXCLUDE:
- Fortune 500 / large multinationals (too big)
- Government organizations
- Non-manufacturing businesses (retail, SaaS, services, consulting)
- Any company whose existence you cannot confirm with high confidence

Real examples of the TYPE of mid-market manufacturers to find:
- UFP Technologies (ufpt.com) — packaging, USA, ~2000 employees
- Core Molding Technologies (coremt.com) — plastics, USA, ~600 employees
- CML Microsystems (cmlmicro.com) — electronics, UK
- Insteel Industries (insteel.com) — steel/machinery, USA
- Roper Technologies divisions, Haynes Wire Company, Rogers Corporation

Output valid JSON only. Wrap the array in an object: {"companies": [...]}`;


export class ProspectFinderAgent extends BaseAgent<ProspectFinderInput, ProspectCandidate[]> {
  protected readonly agentName = 'ProspectFinderAgent';

  async run(input: ProspectFinderInput): Promise<AgentResult<ProspectCandidate[]>> {
    return this.wrap(async () => {
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `From your training knowledge, recall ${input.limit ?? 10} REAL, EXISTING manufacturing companies:
- Industry: ${input.industry}
- Country: ${input.country}
- Size: ${input.companySizeMin ?? COMPANY_SIZE_MIN}–${input.companySizeMax ?? COMPANY_SIZE_MAX} employees
${input.existingCompanies?.length ? `- Do NOT include these companies: ${input.existingCompanies.join(', ')}` : ''}

Remember: only list companies you are certain are real. If you cannot recall enough verified companies for this exact industry/country, return fewer results rather than inventing names.

Return JSON object with this exact format:
{"companies": [{
  "companyName": "Exact legal company name",
  "website": "https://their-real-domain.com",
  "industry": "${input.industry}",
  "country": "${input.country}",
  "estimatedEmployees": 150,
  "confidence": 0.85,
  "rationale": "Brief note on what this company makes and why it fits (include any real details you know)"
}]}`,
        { jsonMode: true, temperature: 0.2 },
      );

      const raw = this.parseJSON<unknown>(content);
      const list: ProspectCandidate[] = Array.isArray(raw)
        ? (raw as ProspectCandidate[])
        : (Object.values(raw as Record<string, unknown>).find(Array.isArray) as ProspectCandidate[] ?? []);
      return list.filter((p) => p.confidence >= 0.75);
    });
  }
}
