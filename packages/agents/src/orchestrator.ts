import type { ResearchData, GeneratedEmail, AgentResult } from '@hermes/shared';
import { CompanyResearchAgent, type CompanyResearchInput } from './company-research.agent.js';
import { DecisionMakerAgent } from './decision-maker.agent.js';
import { PainPointAnalysisAgent } from './pain-point-analysis.agent.js';
import { EmailWriterAgent } from './email-writer.agent.js';
import { ReviewAgent } from './review.agent.js';
import { ApprovalAgent } from './approval.agent.js';

export interface OrchestrationInput {
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
  verifiedEvidence?: { sourceUrl: string; evidenceText: string; signalType: 'software_selection' | 'operational_pain' };
}

export interface OrchestrationResult {
  research: ResearchData;
  email: GeneratedEmail;
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
  attempts: number;
  totalTokensUsed: number;
}

/**
 * Chains all 8 agents in sequence: Research → Decision Maker → Pain Points → Email Writer → Review → Approval
 * Automatically retries email generation up to maxRetries times if review fails.
 */
export class HermesOrchestrator {
  private readonly researchAgent = new CompanyResearchAgent();
  private readonly decisionMakerAgent = new DecisionMakerAgent();
  private readonly painPointAgent = new PainPointAnalysisAgent();
  private readonly emailWriterAgent = new EmailWriterAgent();
  private readonly reviewAgent = new ReviewAgent();
  private readonly approvalAgent = new ApprovalAgent();

  async run(input: OrchestrationInput): Promise<AgentResult<OrchestrationResult>> {
    const maxRetries = input.maxRetries ?? 3;
    let totalTokensUsed = 0;

    // Reuse persisted research where available. Do not invent a new "research"
    // result merely by re-prompting the model during email generation.
    const researchResult = input.existingResearch
      ? { success: true as const, data: input.existingResearch, tokensUsed: 0 }
      : await this.researchAgent.run({
          companyName: input.companyName,
          website: input.website,
          industry: input.industry,
          country: input.country,
          serpResults: input.serpResults,
          clearbitData: input.clearbitData,
        });

    if (!researchResult.success || !researchResult.data) {
      return { success: false, error: 'Research failed' };
    }
    totalTokensUsed += researchResult.tokensUsed ?? 0;
    const research = researchResult.data;

    // Step 2: Pain Point Analysis
    const painResult = await this.painPointAgent.run({
      research,
      industry: input.industry,
      companySize: input.employeeCount,
    });

    if (!painResult.success || !painResult.data) {
      return { success: false, error: `Pain point analysis failed: ${painResult.error}` };
    }
    totalTokensUsed += painResult.tokensUsed ?? 0;
    const painPoints = painResult.data;

    // Step 3: Email generation with review loop
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
        industry: input.industry,
        country: input.country,
        research,
        primaryPainPoint: painPoints.primaryFocus,
        emailAngle: painPoints.emailAngle,
        tone: input.tone,
        previousVersions,
        verifiedEvidence: input.verifiedEvidence,
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

      // Merge review scores back into email
      email.reviewScores = review.scores;

      // Track the best email seen regardless of pass/fail
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

      // Store failed version to avoid repeating
      previousVersions.push(email.body);
    }

    // Always use the best email we generated — send to human review even if review threshold not met
    if (!finalEmail) {
      finalEmail = bestEmail;
      approvalStatus = 'pending_approval';
    }

    if (!finalEmail) {
      return {
        success: false,
        error: `Failed to generate any email after ${maxRetries} attempts`,
      };
    }

    return {
      success: true,
      data: {
        research,
        email: finalEmail,
        approvalStatus,
        attempts,
        totalTokensUsed,
      },
      tokensUsed: totalTokensUsed,
    };
  }
}
