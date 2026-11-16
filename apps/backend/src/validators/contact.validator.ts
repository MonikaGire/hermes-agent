import { z } from 'zod';

export const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(''),
  role: z.string().max(150).default('Decision Maker'),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional().transform((v) => {
    if (!v) return v;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }),
  phone: z.string().optional(),
  companyId: z.string().min(1),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactDto = z.infer<typeof createContactSchema>;
export type UpdateContactDto = z.infer<typeof updateContactSchema>;
