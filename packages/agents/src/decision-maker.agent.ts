import type { AgentResult } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface DecisionMakerInput {
  companyName: string;
  companyWebsite: string;
  industry: string;
  country: string;
  employeeCount?: number;
  knownContacts?: Array<{
    name: string;
    role: string;
    email?: string;
    linkedinUrl?: string;
    sourceUrl?: string;
  }>;
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

/**
 * Never ask an LLM to invent a person. Known contacts need their own
 * first-party or verified-directory source before being promoted.
 */
export class DecisionMakerAgent extends BaseAgent<DecisionMakerInput, DecisionMakerOutput> {
  protected readonly agentName = 'DecisionMakerAgent';

  async run(input: DecisionMakerInput): Promise<AgentResult<DecisionMakerOutput>> {
    return this.wrap(async () => {
      const size = input.employeeCount ?? 0;
      const targetRoles = size > 0 && size <= 50
        ? ['Founder', 'Managing Director', 'Owner', 'Operations Director']
        : size > 50 && size <= 150
          ? ['Operations Director', 'Managing Director', 'COO', 'Finance Director']
          : ['Operations Director', 'Manufacturing Director', 'IT Director', 'CFO'];
      const candidate = (input.knownContacts ?? []).find((c) =>
        c.sourceUrl &&
        /^https?:\/\//i.test(c.sourceUrl) &&
        c.name.trim().split(/\s+/).length >= 2 &&
        !/^(?:contact|operations manager|unknown|decision maker)$/i.test(c.name.trim()) &&
        /(director|founder|owner|chief|head|manager|president|ceo|coo|cfo)/i.test(c.role),
      );
      const primaryContact = candidate
        ? {
            name: candidate.name.trim(),
            role: candidate.role,
            ...(candidate.email ? { email: candidate.email } : {}),
            ...(candidate.linkedinUrl ? { linkedinUrl: candidate.linkedinUrl } : {}),
            confidence: 0.7, // A supplied source still requires separate human verification.
          }
        : undefined;

      return {
        targetRoles,
        primaryContact,
        outreachPersona: targetRoles[0] ?? 'Operations Director',
        reasoning: primaryContact
          ? 'Named contact was supplied with a source. Verify current role and email before outreach.'
          : 'No sourced named contact supplied. Research the buying committee; do not invent a person.',
      };
    });
  }
}
