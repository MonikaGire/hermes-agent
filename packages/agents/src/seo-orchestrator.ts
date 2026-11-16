import type { ResearchData, GeneratedEmail, AgentResult } from '@hermes/shared';
import { CompanyResearchAgent, type CompanyResearchInput } from './company-research.agent.js';
import { SEOEmailWriterAgent } from './seo-email-writer.agent.js';
import { ReviewAgent } from './review.agent.js';
import { ApprovalAgent } from './approval.agent.js';

export interface SEOOrchestrationInput {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  employeeCount?: number;
  contactName: string;
  contactRole: string;
  tone?: 'professional' | 'casual' | 'direct';
  serpResults?: CompanyResearchInput['serpResults'];
  clearbitData?: CompanyResearchInput['clearbitData'];
  autoApprove?: boolean;
  maxRetries?: number;
  existingResearch?: ResearchData;
}

export interface SEOOrchestrationResult {
  research: ResearchData;
  email: GeneratedEmail;
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
  attempts: number;
  totalTokensUsed: number;
}

export class SEOOrchestrator {
  private readonly researchAgent = new CompanyResearchAgent();
  private readonly emailWriterAgent = new SEOEmailWriterAgent();
  private readonly reviewAgent = new ReviewAgent();
  private readonly approvalAgent = new ApprovalAgent();

  async run(input: SEOOrchestrationInput): Promise<AgentResult<SEOOrchestrationResult>> {
    const maxRetries = input.maxRetries ?? 3;
    let totalTokensUsed = 0;
    let research: ResearchData;

    if (input.existingResearch) {
      research = input.existingResearch;
    } else {
      const researchResult = await this.researchAgent.run({
        companyName: input.companyName,
        website: input.website,
        industry: input.industry,
        country: input.country,
        serpResults: input.serpResults,
        clearbitData: input.clearbitData,
      });

      if (!researchResult.success || !researchResult.data) {
        return { success: false, error: `Research failed: ${researchResult.error}` };
      }
      totalTokensUsed += researchResult.tokensUsed ?? 0;
      research = researchResult.data;
    }

    let attempts = 0;
    let finalEmail: GeneratedEmail | null = null;
    let bestEmail: GeneratedEmail | null = null;
    let bestScore = -1;
    let approvalStatus: 'approved' | 'pending_approval' | 'rejected' = 'pending_approval';
    const previousVersions: string[] = [];

    while (attempts < maxRetries) {
      attempts++;

      const emailResult = await this.emailWriterAgent.run({
        contactName: input.contactName,
        contactRole: input.contactRole,
        companyName: input.companyName,
        website: input.website,
        industry: input.industry,
        country: input.country,
        research,
        tone: input.tone,
        previousVersions,
      });

      if (!emailResult.success || !emailResult.data) continue;
      totalTokensUsed += emailResult.tokensUsed ?? 0;
      const email = emailResult.data;

      const reviewResult = await this.reviewAgent.run({
        email,
        companyContext: `${input.companyName} (${input.industry}, ${input.country})`,
        contactContext: `${input.contactName}, ${input.contactRole}`,
      });

      if (!reviewResult.success || !reviewResult.data) {
        if (!bestEmail) bestEmail = email;
        previousVersions.push(email.body);
        continue;
      }
      totalTokensUsed += reviewResult.tokensUsed ?? 0;
      const review = reviewResult.data;

      email.reviewScores = review.scores;

      const score = review.scores.overall ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestEmail = review.revisedEmail ? { ...email, ...review.revisedEmail } : email;
      }

      if (review.passed) {
        const approvalResult = await this.approvalAgent.run({
          email,
          reviewPassed: true,
          autoApprove: input.autoApprove,
        });

        if (approvalResult.success && approvalResult.data) {
          approvalStatus = approvalResult.data.status;
          finalEmail = bestEmail;
          break;
        }
      }

      previousVersions.push(email.body);
    }

    if (!finalEmail) {
      finalEmail = bestEmail;
      approvalStatus = 'pending_approval';
    }

    if (!finalEmail) {
      return { success: false, error: `Failed to generate SEO email after ${maxRetries} attempts` };
    }

    return {
      success: true,
      data: { research, email: finalEmail, approvalStatus, attempts, totalTokensUsed },
      tokensUsed: totalTokensUsed,
    };
  }
}
