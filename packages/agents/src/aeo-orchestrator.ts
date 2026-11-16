import type { AEOResearchData, GeneratedEmail, AgentResult } from '@hermes/shared';
import { AEOResearchAgent, type AEOResearchInput } from './aeo-research.agent.js';
import { AEOOpportunityAgent } from './aeo-opportunity.agent.js';
import { AEOEmailWriterAgent } from './aeo-email-writer.agent.js';
import { ReviewAgent } from './review.agent.js';
import { ApprovalAgent } from './approval.agent.js';

export interface AEOOrchestrationInput {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  employeeCount?: number;
  contactName: string;
  contactRole: string;
  tone?: 'professional' | 'casual' | 'direct';
  serpResults?: AEOResearchInput['serpResults'];
  existingResearch?: AEOResearchData;
  autoApprove?: boolean;
  maxRetries?: number;
}

export interface AEOOrchestrationResult {
  research: AEOResearchData;
  email: GeneratedEmail;
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
  attempts: number;
  totalTokensUsed: number;
}

export class AEOOrchestrator {
  private readonly researchAgent = new AEOResearchAgent();
  private readonly opportunityAgent = new AEOOpportunityAgent();
  private readonly emailWriterAgent = new AEOEmailWriterAgent();
  private readonly reviewAgent = new ReviewAgent();
  private readonly approvalAgent = new ApprovalAgent();

  async run(input: AEOOrchestrationInput): Promise<AgentResult<AEOOrchestrationResult>> {
    const maxRetries = input.maxRetries ?? 3;
    let totalTokensUsed = 0;

    // Step 1: AEO Research (skip if existing research provided)
    let research: AEOResearchData;
    if (input.existingResearch) {
      research = input.existingResearch;
    } else {
      const researchResult = await this.researchAgent.run({
        companyName: input.companyName,
        website: input.website,
        industry: input.industry,
        country: input.country,
        serpResults: input.serpResults,
      });

      if (!researchResult.success || !researchResult.data) {
        return { success: false, error: `AEO research failed: ${researchResult.error}` };
      }
      totalTokensUsed += researchResult.tokensUsed ?? 0;
      research = researchResult.data;
    }

    // Step 2: Opportunity Analysis
    const opportunityResult = await this.opportunityAgent.run({
      research,
      industry: input.industry,
      companySize: input.employeeCount,
    });

    if (!opportunityResult.success || !opportunityResult.data) {
      return { success: false, error: `AEO opportunity analysis failed: ${opportunityResult.error}` };
    }
    totalTokensUsed += opportunityResult.tokensUsed ?? 0;
    const { primaryFocus, emailAngle } = opportunityResult.data;

    // Step 3: Email generation with review loop
    let attempts = 0;
    let finalEmail: GeneratedEmail | null = null;
    let bestEmail: GeneratedEmail | null = null;
    let bestScore = 0;
    const previousVersions: string[] = [];

    while (attempts < maxRetries) {
      attempts++;

      const emailResult = await this.emailWriterAgent.run({
        contactName: input.contactName,
        contactRole: input.contactRole,
        companyName: input.companyName,
        industry: input.industry,
        country: input.country,
        research,
        primaryOpportunity: primaryFocus,
        emailAngle,
        tone: input.tone,
        previousVersions: previousVersions.slice(-2),
      });

      if (!emailResult.success || !emailResult.data) continue;
      totalTokensUsed += emailResult.tokensUsed ?? 0;
      const email = emailResult.data;

      const reviewResult = await this.reviewAgent.run({
        email,
        companyContext: `${input.companyName} — ${input.industry} company in ${input.country}`,
        contactContext: `${input.contactName}, ${input.contactRole}`,
      });
      totalTokensUsed += reviewResult.tokensUsed ?? 0;

      const score = email.reviewScores.overall;
      if (score > bestScore) {
        bestScore = score;
        bestEmail = email;
      }

      if (score >= 6.5) {
        finalEmail = email;
        break;
      }

      previousVersions.push(email.body);
    }

    const chosenEmail = finalEmail ?? bestEmail;
    if (!chosenEmail) {
      return { success: false, error: 'Failed to generate a qualifying AEO email after retries' };
    }

    // Step 4: Approval decision
    const approvalResult = await this.approvalAgent.run({
      email: chosenEmail,
      reviewPassed: bestScore >= 6.5,
      autoApprove: input.autoApprove ?? false,
    });
    totalTokensUsed += approvalResult.tokensUsed ?? 0;

    const approvalStatus = approvalResult.data?.status === 'approved'
      ? 'approved'
      : 'pending_approval';

    return {
      success: true,
      data: { research, email: chosenEmail, approvalStatus, attempts, totalTokensUsed },
      tokensUsed: totalTokensUsed,
    };
  }
}
