import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  website: z.string().url().optional(),
  industry: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  employeeCount: z.number().int().positive().optional(),
  revenueEstimate: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  description: z.string().optional(),
  serviceMode: z.enum(['ERP', 'AEO', 'SEO']).optional(),
});

export const updateCompanySchema = createCompanySchema.partial();

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
