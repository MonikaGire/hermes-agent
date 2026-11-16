import { prisma } from '@hermes/database';

interface LogActivityParams {
  type: string;
  entityType: string;
  entityId: string;
  companyId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  await prisma.activity.create({
    data: {
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      companyId: params.companyId,
      userId: params.userId,
      meta: params.meta as import('@prisma/client').Prisma.InputJsonValue,
    },
  });
}
