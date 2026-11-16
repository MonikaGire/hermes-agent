import type { AgentResult } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface DecisionMakerInput {
  companyName: string;
  companyWebsite: string;
  industry: string;
  country: string;
  employeeCount?: number;
  knownContacts?: Array<{ name: string; role: string }>;
}

export interface DecisionMakerOutput {
  targetRoles: string[];
  primaryContact?: {
    name: string;
    role: string;
    email?: string;
    linkedinUrl?: string;
    confidence: number;
  };
  outreachPersona: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert B2B sales researcher specializing in manufacturing companies.

Your task is to identify the right decision makers for an ERP system sale.

For manufacturing companies, the typical ERP buying committee:
- Primary decision maker: CEO, COO, Operations Director, Manufacturing Director
- Secondary influencer: IT Director, Finance Director, Production Manager
- Champion: Plant Manager, Supply Chain Manager

Company size guidelines:
- 20-50 employees: CEO/Owner is primary decision maker
- 50-150 employees: COO or Operations Director
- 150-500 employees: Operations Director or Manufacturing Director, with IT Director as influencer

Output valid JSON only.`;

export class DecisionMakerAgent extends BaseAgent<DecisionMakerInput, DecisionMakerOutput> {
  protected readonly agentName = 'DecisionMakerAgent';

  async run(input: DecisionMakerInput): Promise<AgentResult<DecisionMakerOutput>> {
    return this.wrap(async () => {
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `Identify decision makers for:
Company: ${input.companyName}
Industry: ${input.industry}
Country: ${input.country}
Employees: ${input.employeeCount ?? 'Unknown'}
${input.knownContacts?.length ? `Known contacts: ${input.knownContacts.map((c) => `${c.name} (${c.role})`).join(', ')}` : ''}

Return JSON:
{
  "targetRoles": ["role 1", "role 2"],
  "primaryContact": {
    "name": "if known from context",
    "role": "Operations Director",
    "confidence": 0.8
  },
  "outreachPersona": "describe who we're targeting and why",
  "reasoning": "why these roles are the right decision makers for this company"
}`,
        { jsonMode: true, temperature: 0.3 },
      );

      return this.parseJSON<DecisionMakerOutput>(content);
    });
  }
}
