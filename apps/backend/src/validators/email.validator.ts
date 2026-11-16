import { z } from 'zod';

export const generateEmailSchema = z.object({
  companyId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  researchId: z.string().min(1).optional(),
  tone: z.enum(['professional', 'casual', 'direct']).default('professional'),
  focusPainPoint: z.string().optional(),
});

export const updateEmailSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  status: z
    .enum(['draft', 'pending_approval', 'approved', 'sent', 'skipped'])
    .optional(),
});

export type GenerateEmailDto = z.infer<typeof generateEmailSchema>;
export type UpdateEmailDto = z.infer<typeof updateEmailSchema>;
