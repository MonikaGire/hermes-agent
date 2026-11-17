import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';

/**
 * Suppression survives a change of conversation status or a new outbound thread.
 * Stored activities are append-only compliance evidence; they are not undone
 * by re-verifying a contact's email.
 */
export async function assertCompanyNotSuppressed(companyId: string): Promise<void> {
  const [conversation, activity] = await Promise.all([
    prisma.conversation.findFirst({
      where: { companyId, status: 'SUPPRESSED' }, select: { id: true },
    }),
    prisma.activity.findFirst({
      where: { companyId, type: { in: ['conversation.suppressed', 'prospect.suppressed'] } },
      select: { id: true },
    }),
  ]);
  if (conversation || activity) {
    throw new AppError('Contact blocked: this prospect/company is on the suppression list.', 400);
  }
}
