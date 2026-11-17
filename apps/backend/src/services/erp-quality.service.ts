import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';

/**
 * Outbound is a privilege earned by review, not by an LLM-generated
 * confidence score or a scraped email address.
 */
export interface ApprovedErpEvidence {
  sourceUrl: string;
  evidenceText: string;
  signalType: 'software_selection' | 'operational_pain';
}

export async function assertErpOutreachEligible(companyId: string, contact: {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string | null;
  isVerified: boolean;
} | null | undefined): Promise<ApprovedErpEvidence> {
  if (!contact || !contact.email || !contact.isVerified) {
    throw new AppError('ERP outreach blocked: verify a real decision-maker and their business email first.', 400);
  }

  const fullName = (contact.firstName + ' ' + contact.lastName).trim();
  if (/^(?:contact|unknown|decision maker|operations manager|sales)$/i.test(fullName) ||
      /^contact\b/i.test(fullName) ||
      !contact.lastName.trim() ||
      /^(?:unknown|decision maker|n\/a)$/i.test(contact.role)) {
    throw new AppError('ERP outreach blocked: placeholder contacts cannot be emailed.', 400);
  }

  const [review, suppressed] = await Promise.all([
    prisma.activity.findFirst({
      where: { companyId, type: 'prospect.evidence_reviewed' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.conversation.findFirst({
      where: { companyId, status: 'SUPPRESSED' },
      select: { id: true },
    }),
  ]);

  if (!review) {
    throw new AppError('ERP outreach blocked: review and approve a dated first-party buying/pain source before drafting.', 400);
  }
  if (suppressed) {
    throw new AppError('ERP outreach blocked: this company has opted out or was suppressed.', 400);
  }
  const meta = review.meta as Record<string, unknown> | null;
  if (!meta || typeof meta['sourceUrl'] !== 'string' || typeof meta['evidenceText'] !== 'string' ||
      !['software_selection', 'operational_pain'].includes(String(meta['signalType'])) ||
      meta['vendorAlreadySelected'] !== false) {
    throw new AppError('ERP outreach blocked: approved evidence is incomplete.', 400);
  }
  const date = typeof meta['observedAt'] === 'string' ? new Date(meta['observedAt']) : null;
  if (!date || Number.isNaN(date.getTime()) || (Date.now() - date.getTime()) > 365 * 86_400_000) {
    throw new AppError('ERP outreach blocked: evidence is stale or undated.', 400);
  }
  return {
    sourceUrl: meta['sourceUrl'],
    evidenceText: meta['evidenceText'],
    signalType: meta['signalType'] as ApprovedErpEvidence['signalType'],
  };
}
