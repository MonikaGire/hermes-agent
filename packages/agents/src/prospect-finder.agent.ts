import type { AgentResult } from '@hermes/shared';
import { COMPANY_SIZE_MIN, COMPANY_SIZE_MAX } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';
import {
  qualifyErpEvidence,
  type ErpSourceEvidence,
  type ErpSignalType,
} from './erp-evidence.js';

export interface ProspectFinderInput {
  industry: string;
  country: string;
  companySizeMin?: number;
  companySizeMax?: number;
  limit?: number;
  existingCompanies?: string[];
  /** Actual search-result evidence. Model training recall is NOT a source. */
  searchEvidence?: ErpSourceEvidence[];
}

export interface ProspectCandidate {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  estimatedEmployees?: number;
  confidence: number;
  rationale: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
  signalType: ErpSignalType;
  verification: 'search_excerpt';
}

/**
 * Do not use LLM training recall to invent a lead list.
 * Searches must be performed by the configured provider, then screened here.
 *
 * A search snippet alone cannot make a company "ready to buy". Every returned
 * candidate is a REVIEW candidate until a person or first-party page confirms it.
 */
export class ProspectFinderAgent extends BaseAgent<ProspectFinderInput, ProspectCandidate[]> {
  protected readonly agentName = 'ProspectFinderAgent';

  async run(input: ProspectFinderInput): Promise<AgentResult<ProspectCandidate[]>> {
    return this.wrap(async () => {
      const seen = new Set((input.existingCompanies ?? []).map((n) => n.trim().toLowerCase()));
      const candidates: ProspectCandidate[] = [];

      for (const evidence of input.searchEvidence ?? []) {
        const signal = qualifyErpEvidence(evidence);
        if (!signal) continue;
        const key = evidence.companyName.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          companyName: evidence.companyName.trim(),
          website: new URL(evidence.website).origin,
          industry: input.industry,
          country: input.country,
          confidence: signal.score / 100,
          rationale: signal.evidenceExcerpt,
          sourceUrl: signal.evidenceUrl,
          sourcePublishedAt: signal.publishedAt,
          signalType: signal.type,
          verification: signal.verification,
        });
        if (candidates.length >= Math.min(input.limit ?? 10, 50)) break;
      }
      return candidates;
    });
  }
}
