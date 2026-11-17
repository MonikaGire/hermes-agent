import { prisma } from '@hermes/database';
import type { Prisma, EmailStatus } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import { logActivity } from './activity.service.js';
import { EmailSenderService } from '../integrations/email-sender.service.js';
import { assertErpOutreachEligible } from './erp-quality.service.js';
import type { GenerateEmailDto, UpdateEmailDto } from '../validators/email.validator.js';
import type { ReviewScores } from '@hermes/shared';

export class EmailService {
  private readonly sender = new EmailSenderService();

  async list(opts: { page: number; limit: number; query: Record<string, unknown> }) {
    const { page, limit, query } = opts;
    const skip = (page - 1) * limit;

    const where = {
      ...(query['companyId'] ? { companyId: query['companyId'] as string } : {}),
      ...(query['status'] ? { status: query['status'] as EmailStatus } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.email.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { select: { id: true, name: true, industry: true } },
          contact: { select: { id: true, firstName: true, lastName: true, role: true, email: true } },
        },
      }),
      prisma.email.count({ where }),
    ]);

    return { data, total };
  }

  async getById(id: string) {
    const email = await prisma.email.findUnique({
      where: { id },
      include: { company: true, contact: true, approvals: { include: { user: { select: { id: true, name: true } } } } },
    });
    if (!email) throw new AppError('Email not found', 404);
    return email;
  }

  async generate(dto: GenerateEmailDto) {
    const company = await prisma.company.findUnique({
      where: { id: dto.companyId },
      include: {
        contacts: { take: 20, orderBy: { createdAt: 'desc' } },
        research: { orderBy: { createdAt: 'desc' }, take: 1 },
        aeoResearch: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!company) throw new AppError('Company not found', 404);

    const serviceMode = company.serviceMode ?? 'ERP';
    const contact = serviceMode === 'ERP'
      ? company.contacts.find((item) => item.email && item.isVerified)
      : company.contacts[0];
    if (!contact) throw new AppError('A verified business contact is required for ERP email drafting.', 400);
    const reviewedEvidence = serviceMode === 'ERP'
      ? await assertErpOutreachEligible(company.id, contact)
      : undefined;

    let email: { subject: string; body: string; wordCount: number; reviewScores: unknown };
    let approvalStatus: string;

    if (serviceMode === 'AEO') {
      const { AEOOrchestrator } = await import('@hermes/agents');
      const orchestrator = new AEOOrchestrator();
      const aeoResearch = company.aeoResearch[0];

      // Build existing research from DB record if available to skip the research step
      const existingResearch = aeoResearch ? {
        appearsInAIAnswers: aeoResearch.appearsInAIAnswers,
        aiAnswerEvidence: aeoResearch.aiAnswerEvidence,
        competitorAIPresence: aeoResearch.competitorAIPresence,
        faqContentGaps: aeoResearch.faqContentGaps,
        schemaMarkupStatus: aeoResearch.schemaMarkupStatus ?? '',
        brandMentions: aeoResearch.brandMentions,
        contentQualityNotes: aeoResearch.contentQualityNotes,
        opportunities: (aeoResearch.aeoOpportunities as unknown as import('@hermes/shared').AEOOpportunity[]) ?? [],
        primaryOpportunity: aeoResearch.primaryOpportunity ?? '',
        opportunityScore: aeoResearch.opportunityScore,
        summary: aeoResearch.summary,
      } : undefined;

      if (!existingResearch) throw new AppError('No AEO research found. Run AEO research first.', 400);

      const result = await orchestrator.run({
        companyName: company.name,
        website: company.website ?? '',
        industry: company.industry,
        country: company.country,
        employeeCount: company.employeeCount ?? undefined,
        contactName: `${contact.firstName} ${contact.lastName}`,
        contactRole: contact.role,
        tone: dto.tone,
        existingResearch,
      });

      if (!result.success || !result.data) {
        throw new AppError(`AEO email generation failed: ${result.error}`, 500);
      }
      email = result.data.email;
      approvalStatus = result.data.approvalStatus;
    } else if (serviceMode === 'SEO') {
      const { SEOOrchestrator } = await import('@hermes/agents');
      const orchestrator = new SEOOrchestrator();
      const research = company.research[0];

      const existingResearch = research ? {
        products: research.products,
        locations: research.locations,
        recentNews: research.recentNews as unknown as string[],
        expansionPlans: research.expansionPlans,
        hiringActivity: research.hiringActivity,
        techStack: research.techStack,
        investments: research.investments,
        acquisitions: research.acquisitions,
        painPoints: [],
        summary: research.summary,
      } : undefined;

      const result = await orchestrator.run({
        companyName: company.name,
        website: company.website ?? '',
        industry: company.industry,
        country: company.country,
        employeeCount: company.employeeCount ?? undefined,
        contactName: `${contact.firstName} ${contact.lastName}`,
        contactRole: contact.role,
        tone: dto.tone,
        existingResearch,
      });

      if (!result.success || !result.data) {
        throw new AppError(`SEO email generation failed: ${result.error}`, 500);
      }
      email = result.data.email;
      approvalStatus = result.data.approvalStatus;
    } else {
      const { HermesOrchestrator } = await import('@hermes/agents');
      const orchestrator = new HermesOrchestrator();
      const research = company.research[0];
      if (!research) throw new AppError('No research found. Run research first.', 400);

      const result = await orchestrator.run({
        companyName: company.name,
        website: company.website ?? '',
        industry: company.industry,
        country: company.country,
        employeeCount: company.employeeCount ?? undefined,
        contactName: `${contact.firstName} ${contact.lastName}`,
        contactRole: contact.role,
        tone: dto.tone,
        verifiedEvidence: reviewedEvidence,
        existingResearch: {
          products: research.products,
          locations: research.locations,
          recentNews: research.recentNews as unknown as string[],
          expansionPlans: research.expansionPlans,
          hiringActivity: research.hiringActivity,
          techStack: research.techStack,
          investments: research.investments,
          acquisitions: research.acquisitions,
          painPoints: [],
          summary: research.summary,
        },
      });

      if (!result.success || !result.data) {
        throw new AppError(`Email generation failed: ${result.error}`, 500);
      }
      email = result.data.email;
      approvalStatus = result.data.approvalStatus;
    }

    const created = await prisma.email.create({
      data: {
        companyId: dto.companyId,
        contactId: contact.id,
        subject: email.subject,
        body: email.body,
        wordCount: email.wordCount,
        reviewScores: email.reviewScores as unknown as Prisma.InputJsonValue,
        status: approvalStatus === 'approved' ? 'APPROVED' : 'PENDING_APPROVAL',
        serviceMode: serviceMode as 'ERP' | 'AEO' | 'SEO',
        tone: dto.tone ?? 'professional',
      },
    });

    await prisma.company.update({ where: { id: dto.companyId }, data: { status: 'EMAIL_DRAFT' } });
    await logActivity({ type: 'email.generated', entityType: 'email', entityId: created.id, companyId: dto.companyId });

    return created;
  }

  async send(id: string) {
    const email = await this.getById(id);

    if (email.status !== 'APPROVED') {
      throw new AppError('Email must be approved before sending', 400);
    }

    if (!email.contact?.email) {
      throw new AppError('Contact email address is required', 400);
    }

    if (email.serviceMode === 'ERP') {
      await assertErpOutreachEligible(email.companyId, email.contact);
    }

    const result = await this.sender.send({
      to: email.contact.email,
      subject: email.subject,
      html: email.body.replace(/\n/g, '<br>'),
      text: email.body,
    });

    const updated = await prisma.email.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId: result.messageId,
        provider: result.provider,
      },
    });

    // Create a conversation thread to track replies
    const existingConversation = await prisma.conversation.findUnique({ where: { emailId: id } });
    if (!existingConversation) {
      const conversation = await prisma.conversation.create({
        data: {
          companyId: email.companyId,
          emailId: id,
          status: 'AWAITING_REPLY',
          lastMessageAt: new Date(),
          messages: {
            create: {
              direction: 'OUTBOUND',
              subject: email.subject,
              body: email.body,
              toEmail: email.contact.email,
              sentAt: new Date(),
            },
          },
        },
      });
      await logActivity({ type: 'conversation.created', entityType: 'conversation', entityId: conversation.id, companyId: email.companyId });
    }

    await prisma.company.update({ where: { id: email.companyId }, data: { status: 'EMAIL_SENT' } });
    await logActivity({ type: 'email.sent', entityType: 'email', entityId: id, companyId: email.companyId });

    return updated;
  }

  async regenerate(id: string) {
    const email = await this.getById(id);
    if (email.status === 'SENT') throw new AppError('Cannot regenerate a sent email', 400);

    const dto: GenerateEmailDto = { companyId: email.companyId, tone: (email.tone as 'professional' | 'casual' | 'direct' | null) ?? 'professional' };
    const newEmail = await this.generate(dto);

    await prisma.email.update({ where: { id }, data: { status: 'SKIPPED' } });
    await logActivity({ type: 'email.regenerated', entityType: 'email', entityId: id, companyId: email.companyId });

    return newEmail;
  }

  async update(id: string, dto: UpdateEmailDto) {
    await this.getById(id);
    return prisma.email.update({ where: { id }, data: dto as Prisma.EmailUpdateInput });
  }

  async remove(id: string) {
    const email = await this.getById(id);
    if (email.status === 'SENT') throw new AppError('Cannot delete a sent email', 400);
    await prisma.email.delete({ where: { id } });
  }
}
