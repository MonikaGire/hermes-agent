import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';
import { getQueue, QUEUE_NAMES } from '../queues/index.js';

export class ApprovalService {
  async list(opts: { page: number; limit: number }) {
    const { page, limit } = opts;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.approval.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          email: { include: { company: true, contact: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.approval.count(),
    ]);

    return { data, total };
  }

  async getPending() {
    return prisma.email.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'asc' },
      include: {
        company: { select: { id: true, name: true, industry: true, country: true } },
        contact: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
  }

  async approve(emailId: string, userId: string) {
    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) throw new AppError('Email not found', 404);
    if (email.status !== 'PENDING_APPROVAL') throw new AppError('Email is not pending approval', 400);

    const updated = await prisma.email.update({ where: { id: emailId }, data: { status: 'APPROVED' } });
    await prisma.approval.create({ data: { emailId, userId, action: 'APPROVED' } });
    await prisma.company.update({ where: { id: email.companyId }, data: { status: 'EMAIL_APPROVED' } });
    await logActivity({ type: 'email.approved', entityType: 'email', entityId: emailId, companyId: email.companyId, userId });

    return updated;
  }

  async skip(emailId: string, userId: string, reason?: string) {
    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) throw new AppError('Email not found', 404);

    const updated = await prisma.email.update({ where: { id: emailId }, data: { status: 'SKIPPED' } });
    await prisma.approval.create({ data: { emailId, userId, action: 'SKIPPED', reason } });
    await prisma.company.update({ where: { id: email.companyId }, data: { status: 'SKIPPED' } });
    await logActivity({ type: 'email.skipped', entityType: 'email', entityId: emailId, companyId: email.companyId, userId });

    return updated;
  }

  async revise(emailId: string, instructions: string) {
    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) throw new AppError('Email not found', 404);

    const queue = getQueue(QUEUE_NAMES.EMAIL_GENERATION);
    const job = await queue.add('revise', { emailId, companyId: email.companyId, instructions });

    await logActivity({ type: 'email.revision_requested', entityType: 'email', entityId: emailId, companyId: email.companyId });

    return { jobId: job.id, message: 'Revision queued' };
  }
}
