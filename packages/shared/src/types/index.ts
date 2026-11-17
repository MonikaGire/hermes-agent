// =============================================
// HERMES Shared Types
// =============================================

export type ProspectStatus =
  | 'new'
  | 'researching'
  | 'researched'
  | 'email_draft'
  | 'email_pending'
  | 'email_approved'
  | 'email_sent'
  | 'replied'
  | 'converted'
  | 'skipped';

export type EmailStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'skipped';

export type UserRole = 'admin' | 'user';

export type EmailProvider = 'smtp' | 'ses' | 'sendgrid';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  details?: Record<string, string[]>;
}

export interface DashboardStats {
  totalProspects: number;
  emailsGenerated: number;
  emailsApproved: number;
  emailsSent: number;
  replyRate: number;
  conversions: number;
}

export interface ResearchData {
  products: string[];
  locations: string[];
  recentNews: string[];
  expansionPlans: string[];
  hiringActivity: string[];
  techStack: string[];
  investments: string[];
  acquisitions: string[];
  painPoints: PainPoint[];
  summary: string;
}

export interface PainPoint {
  problem: string;
  erpCapability: string;
  businessOutcome: string;
  evidenceScore: number;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  reviewScores: ReviewScores;
  wordCount: number;
}

export interface ReviewScores {
  researchRelevance: number;
  personalization: number;
  humanTone: number;
  businessValue: number;
  replyProbability: number;
  overall: number;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  durationMs?: number;
}

// =============================================
// SERVICE MODE
// =============================================
export type ServiceMode = 'erp' | 'aeo' | 'seo';

// =============================================
// AEO TYPES
// =============================================
export interface AEOOpportunity {
  area: string;
  observation: string;
  recommendation: string;
  impactScore: number;
}

export interface AEOResearchData {
  appearsInAIAnswers: boolean;
  aiAnswerEvidence: string[];
  competitorAIPresence: string[];
  faqContentGaps: string[];
  schemaMarkupStatus: string;
  brandMentions: string[];
  contentQualityNotes: string[];
  opportunities: AEOOpportunity[];
  primaryOpportunity: string;
  opportunityScore: number;
  summary: string;
}

// =============================================
// CONVERSATION / REPLY TYPES
// =============================================
export type ReplyIntent =
  | 'INTERESTED'
  | 'MEETING_REQUEST'
  | 'NOT_NOW'
  | 'OBJECTION'
  | 'INFO_REQUEST'
  | 'QUESTION'
  | 'NEGATIVE'
  | 'UNSUBSCRIBE'
  | 'REFERRAL'
  | 'UNCLEAR';

export interface ReplyIntentResult {
  intent: ReplyIntent;
  confidence: number;
  summary: string;
  followUpAt?: string;
  referredTo?: string;
  objectionText?: string;
  suggestedAction: string;
}

export interface ConversationContext {
  companyName: string;
  contactName: string;
  contactRole: string;
  serviceMode: ServiceMode;
  originalEmail: { subject: string; body: string };
  thread: Array<{ direction: 'outbound' | 'inbound'; body: string; sentAt: string }>;
  researchSummary: string;
  primaryOpportunity?: string;
  draftPurpose?: 'inbound_reply' | 'scheduled_follow_up';
  followUpReason?: string;
  intent: ReplyIntent;
  intentDetails: ReplyIntentResult;
}

export interface ConversationReply {
  subject: string;
  body: string;
  rationale: string;
  suggestedFollowUpDays?: number;
}
