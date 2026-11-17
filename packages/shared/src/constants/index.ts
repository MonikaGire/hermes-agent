export const TARGET_COUNTRIES = ['USA', 'UK', 'Australia', 'Singapore'] as const;
export type TargetCountry = (typeof TARGET_COUNTRIES)[number];

export const TARGET_INDUSTRIES = [
  'Electronics',
  'Packaging',
  'Plastics',
  'Medical devices',
  'Chemicals',
  'Machinery',
  'Food manufacturing',
] as const;
export type TargetIndustry = (typeof TARGET_INDUSTRIES)[number];

export const COMPANY_SIZE_MIN = 20;
export const COMPANY_SIZE_MAX = 500;

export const EMAIL_WORD_MIN = 80;
export const EMAIL_WORD_MAX = 180;

export const REVIEW_SCORE_THRESHOLD = 6.5;

export const ERP_CAPABILITIES = {
  MRP: 'Material Requirements Planning',
  BOM: 'Bill of Materials',
  PRODUCTION_PLANNING: 'Production Planning & Scheduling',
  INVENTORY: 'Inventory Management',
  PURCHASE: 'Purchase Management',
  SUPPLIER: 'Supplier Management',
  BATCH_TRACEABILITY: 'Batch & Serial Traceability',
  QUALITY_CONTROL: 'Quality Control',
  IMPORT_TRACKING: 'Import Shipment Tracking',
  LANDED_COST: 'Landed Cost Calculation',
  TALLY_INTEGRATION: 'Tally Integration',
  CUSTOMER_PORTAL: 'Customer Portal',
  CREDIT_CONTROL: 'Credit Control',
  ANALYTICS: 'Analytics & Reporting',
} as const;

export const PAIN_POINT_MAP: Record<string, { capability: string; outcome: string }> = {
  'multiple warehouses': {
    capability: ERP_CAPABILITIES.INVENTORY,
    outcome: 'Lower inventory costs and real-time stock visibility across locations',
  },
  'growing production': {
    capability: ERP_CAPABILITIES.MRP,
    outcome: 'Reduced production delays and optimal material planning',
  },
  'manual tracking': {
    capability: ERP_CAPABILITIES.BATCH_TRACEABILITY,
    outcome: 'Full batch traceability for compliance and reduced recall risk',
  },
  'supplier delays': {
    capability: ERP_CAPABILITIES.PURCHASE,
    outcome: 'Proactive supplier management and on-time delivery improvement',
  },
  'quality rejections': {
    capability: ERP_CAPABILITIES.QUALITY_CONTROL,
    outcome: 'Reduced scrap rates and improved first-pass yield',
  },
  'import complexity': {
    capability: ERP_CAPABILITIES.IMPORT_TRACKING,
    outcome: 'Accurate landed cost and faster customs clearance',
  },
};

// =============================================
// AEO CONSTANTS
// =============================================
export const AEO_TARGET_INDUSTRIES = [
  'Professional Services',
  'Legal',
  'Healthcare',
  'Financial Services',
  'Real Estate',
  'Insurance',
  'Education & Training',
  'Accounting & Tax',
  'IT Services & Consulting',
  'Recruitment & HR',
  'Hospitality',
  'E-commerce',
] as const;
export type AEOTargetIndustry = (typeof AEO_TARGET_INDUSTRIES)[number];

export const AEO_CAPABILITIES = {
  FAQ_OPTIMIZATION: 'FAQ & Q&A Content Optimization for AI engines',
  SCHEMA_MARKUP: 'Structured Data & Schema Markup Implementation',
  ENTITY_BUILDING: 'Brand Entity Building for AI Knowledge Graphs',
  CONTENT_STRUCTURING: 'Content Restructuring for AI Answer Extraction',
  COMPETITOR_GAP: 'AI Visibility Competitive Gap Analysis',
  CITATION_STRATEGY: 'Citation & Source Authority Strategy',
  VOICE_SEARCH: 'Conversational & Voice Search Optimization',
  AI_SNIPPET: 'Featured Snippet & AI Overview Targeting',
} as const;

export const AEO_OPPORTUNITY_MAP: Record<string, { capability: string; outcome: string }> = {
  'not appearing in ai answers': {
    capability: AEO_CAPABILITIES.CONTENT_STRUCTURING,
    outcome: 'Getting cited as a source in ChatGPT, Gemini, and Perplexity answers for their category',
  },
  'competitors dominate ai results': {
    capability: AEO_CAPABILITIES.COMPETITOR_GAP,
    outcome: 'Recapturing buyer attention at the moment of AI-assisted research',
  },
  'missing faq content': {
    capability: AEO_CAPABILITIES.FAQ_OPTIMIZATION,
    outcome: 'Answering the exact questions buyers ask AI tools, increasing qualified organic discovery',
  },
  'no schema markup': {
    capability: AEO_CAPABILITIES.SCHEMA_MARKUP,
    outcome: 'Structured data that makes content machine-readable for AI engines and rich snippets',
  },
  'weak brand entity': {
    capability: AEO_CAPABILITIES.ENTITY_BUILDING,
    outcome: 'Consistent brand recognition in AI knowledge graphs and assistant responses',
  },
  'poor content structure': {
    capability: AEO_CAPABILITIES.AI_SNIPPET,
    outcome: 'Extractable answers that position the brand in AI overviews and featured snippets',
  },
};

// T3 Digiport AEO service knowledge base (used by email writer and reply agent)
export const T3_AEO_KNOWLEDGE = {
  company: 'T3 Digiport (Triple T Digiport LLP)',
  location: 'Pune, India',
  service: 'AEO — Answer Engine Optimization',
  shortDescription:
    'We help businesses appear when their ideal buyers ask AI tools like ChatGPT, Gemini, and Perplexity for recommendations.',
  keyPoints: [
    'AEO is distinct from traditional SEO — it targets AI-generated answers, not just blue-link rankings',
    'Buyers increasingly skip Google and ask ChatGPT or Perplexity directly for vendor recommendations',
    'We analyze whether a business appears in AI answers today and identify why competitors do',
    'Our work includes content restructuring, FAQ optimization, schema markup, and brand entity building',
    'Most businesses in professional services and B2B haven\'t invested in AEO at all — early movers win',
  ],
  cta: 'Would it be worth a short call to show you exactly how you currently appear in AI tools vs. your competitors?',
  senderName: 'Monika',
  senderTitle: 'AEO Strategist, T3 Digiport',
};

// T3 Digiport SEO service knowledge base
export const T3_SEO_KNOWLEDGE = {
  company: 'T3 Digiport (Triple T Digiport LLP)',
  location: 'Pune, India',
  service: 'SEO — Search Engine Optimization',
  shortDescription:
    'We help businesses rank higher on Google and capture organic traffic from buyers actively searching for their products or services.',
  keyPoints: [
    'Most B2B websites lose 60–80% of potential organic traffic due to fixable technical and content issues',
    'We audit page speed, Core Web Vitals, crawlability, and on-page structure — the fundamentals Google rewards',
    'Content strategy targeting buyer-intent keywords, not just generic traffic',
    'Backlink gap analysis vs. competitors who rank ahead of you',
    'Monthly reporting tied to keyword positions, traffic, and leads — not vanity metrics',
    'We focus on industries where organic search drives real purchase decisions',
  ],
  cta: 'Would a quick look at where your site stands vs. competitors on search be useful?',
  senderName: 'Monika',
  senderTitle: 'SEO Strategist, T3 Digiport',
};

export const BANNED_PHRASES = [
  'hope you are doing well',
  'hope you\'re doing well',
  'touching base',
  'industry-leading',
  'revolutionary',
  'best-in-class',
  'game-changer',
  'synergy',
  'leveraging',
  'circle back',
  'reach out',
  'as per my last email',
  'i wanted to follow up',
] as const;

/**
 * ERP outbound discovery targets. Keep separate from the historic multi-service
 * TARGET_INDUSTRIES so SEO/AEO workflows are not changed unexpectedly.
 */
export const ERP_TARGET_INDUSTRIES = [
  'Sheet metal fabrication',
  'Steel service centre',
  'Laser cutting and metal bending',
  'CNC machining and precision metalwork',
  'Stainless steel processing',
  'Metal stockholding and slitting',
] as const;

export const ERP_TARGET_COUNTRIES = [
  'USA', 'UK', 'Australia', 'Canada', 'UAE', 'Singapore',
  'Germany', 'South Africa', 'Poland', 'Mexico', 'Brazil',
  'Saudi Arabia', 'New Zealand', 'Malaysia', 'India',
] as const;
