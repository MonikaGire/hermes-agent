import type { AgentResult, GeneratedEmail } from '@hermes/shared';
import { REVIEW_SCORE_THRESHOLD } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface ApprovalInput {
  email: GeneratedEmail;
  reviewPassed: boolean;
  autoApprove?: boolean;
  maxAutoApproveScore?: number;
}

export interface ApprovalOutput {
  status: 'approved' | 'pending_approval' | 'rejected';
  reason: string;
  confidence: number;
}

export class ApprovalAgent extends BaseAgent<ApprovalInput, ApprovalOutput> {
  protected readonly agentName = 'ApprovalAgent';

  async run(input: ApprovalInput): Promise<AgentResult<ApprovalOutput>> {
    return this.wrap(async () => {
      const { email, reviewPassed, autoApprove = false, maxAutoApproveScore = 9 } = input;
      const overallScore = email.reviewScores?.overall ?? 0;

      // Auto-approve if enabled and score is high enough
      if (autoApprove && reviewPassed && overallScore >= maxAutoApproveScore) {
        return {
          status: 'approved',
          reason: `Auto-approved: review score ${overallScore.toFixed(1)} ≥ ${maxAutoApproveScore}`,
          confidence: overallScore / 10,
        };
      }

      // Require human approval if review passed
      if (reviewPassed) {
        return {
          status: 'pending_approval',
          reason: `Review passed (score: ${overallScore.toFixed(1)}). Awaiting human approval.`,
          confidence: overallScore / 10,
        };
      }

      // Reject if review failed
      return {
        status: 'rejected',
        reason: `Review failed (score: ${overallScore.toFixed(1)} < ${REVIEW_SCORE_THRESHOLD}). Regeneration required.`,
        confidence: 0,
      };
    });
  }
}
