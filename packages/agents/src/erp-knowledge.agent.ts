import type { AgentResult } from '@hermes/shared';
import { ERP_CAPABILITIES } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface ERPKnowledgeInput {
  topic: string;
  context?: string;
}

export interface ERPKnowledgeOutput {
  capability: string;
  businessOutcomes: string[];
  targetedPainPoints: string[];
  salesAngle: string;
}

const SYSTEM_PROMPT = `You are an ERP business value expert for a manufacturing ERP system.

Your role is to translate ERP capabilities into measurable business outcomes for manufacturing companies.

ERP Capabilities you understand deeply:
${Object.entries(ERP_CAPABILITIES).map(([k, v]) => `- ${v}`).join('\n')}

RULES:
- Never sell features. Always sell business outcomes.
- Focus on: revenue growth, cost reduction, margin improvement, operational visibility.
- Be specific and evidence-based. No generic claims.
- Use language a CFO or COO would respond to.
- Output must be valid JSON.`;

export class ERPKnowledgeAgent extends BaseAgent<ERPKnowledgeInput, ERPKnowledgeOutput> {
  protected readonly agentName = 'ERPKnowledgeAgent';

  async run(input: ERPKnowledgeInput): Promise<AgentResult<ERPKnowledgeOutput>> {
    return this.wrap(async () => {
      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `Topic: ${input.topic}\n${input.context ? `Context: ${input.context}` : ''}

Return JSON with:
{
  "capability": "the ERP capability name",
  "businessOutcomes": ["outcome 1", "outcome 2", "outcome 3"],
  "targetedPainPoints": ["pain point 1", "pain point 2"],
  "salesAngle": "one compelling sentence connecting this capability to business value"
}`,
        { jsonMode: true, temperature: 0.3 },
      );

      return this.parseJSON<ERPKnowledgeOutput>(content);
    });
  }
}
