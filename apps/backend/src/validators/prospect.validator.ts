import { z } from 'zod';

export const createProspectSchema = z.object({
  companyName: z.string().min(1).max(255),
  website: z.string().optional().transform((v) => {
    if (!v) return v;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }),
  industry: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  employeeCount: z.number().int().positive().optional(),
  revenueEstimate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProspectSchema = createProspectSchema.partial().extend({
  status: z.enum([
    'new',
    'researching',
    'researched',
    'email_draft',
    'email_pending',
    'email_approved',
    'email_sent',
    'replied',
    'converted',
    'skipped',
  ]).optional(),
  serviceMode: z.enum(['ERP', 'AEO', 'SEO']).optional(),
});

export type CreateProspectDto = z.infer<typeof createProspectSchema>;
export type UpdateProspectDto = z.infer<typeof updateProspectSchema>;
