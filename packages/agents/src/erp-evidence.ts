/**
 * Evidence-first ERP prospect qualification.
 *
 * Search snippets are discovery clues, not proof of a buying decision.
 * Never promote a directory/job-board URL to a manufacturer's website.
 */
export interface ErpSourceEvidence {
  companyName: string;
  website: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  publishedAt?: string;
}

export type ErpSignalType = 'software_selection' | 'operational_pain';

export interface QualifiedErpEvidence {
  type: ErpSignalType;
  score: number;
  evidenceUrl: string;
  evidenceExcerpt: string;
  publishedAt?: string;
  verification: 'search_excerpt';
}

const DIRECTORY_DOMAINS = [
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com',
  'google.com', 'facebook.com', 'reddit.com', 'youtube.com',
  'clutch.co', 'yellowpages.com', 'crunchbase.com', 'apollo.io',
  'serpapi.com', 'amazon.com', 'jobstreet.com', 'naukri.com',
  'monster.com', 'workday.com', 'greenhouse.io', 'lever.co',
  'g2.com', 'capterra.com', 'softwareadvice.com',
];

export function publicCompanyDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!host.includes('.') || host === 'localhost') return null;
    if (/^\d+(?:\.\d+){3}$/.test(host)) return null;
    if (/^\[?[0-9a-f:]+\]?$/i.test(host)) return null;
    if (host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (DIRECTORY_DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain))) return null;
    return host;
  } catch {
    return null;
  }
}

// Require language specific to metal operations AND a meaningful change/problem signal.
// A normal product catalogue or generic manufacturer result is not a buyer.
const METAL_CONTEXT = /\b(?:steel|sheet[\s-]?metal|metal[\s-]?(?:fabricat\w*|process\w*|work\w*)|laser[\s-]?cut\w*|cnc|machin\w*|weld\w*|stainless|alumini?um|offcuts?|remnants?|coil[\s-]?slitt\w*|rebar)\b/i;
const SOFTWARE_SELECTION = /\b(?:erp|mrp|inventory|production|warehouse|shop[\s-]?floor)\s+(?:software|system|platform)\b[\s\S]{0,100}\b(?:select|evaluat|replac|implement|migrat|roll[\s-]?out|procure|rfp|tender|develop|build|seek|search)/i;
const SELECTION_REVERSE = /\b(?:select|evaluat|replac|implement|migrat|roll[\s-]?out|procure|rfp|tender|develop|build|seek|search)[\s\S]{0,100}\b(?:erp|mrp|inventory|production|warehouse)\s+(?:software|system|platform)\b/i;
const OPERATIONAL_PAIN = /\b(?:spreadsheets?|excel|manual(?:ly)?|paper[\s-]?based|stock[\s-]?(?:discrepan|variance|reconcil)|inventory[\s-]?(?:discrepan|variance|reconcil)|offcuts?|remnants?|material[\s-]?(?:shortage|traceab)|heat[\s-]?number|job[\s-]?cost|work[\s-]?in[\s-]?progress|production[\s-]?(?:delay|bottleneck)|quot(?:ation|ing)[\s-]?(?:delay|register)|duplicate[\s-]?entry)\b/i;

export function qualifyErpEvidence(
  source: ErpSourceEvidence,
  now = new Date(),
): QualifiedErpEvidence | null {
  const websiteDomain = publicCompanyDomain(source.website);
  const evidenceDomain = publicCompanyDomain(source.sourceUrl);
  if (!websiteDomain || !evidenceDomain || websiteDomain !== evidenceDomain) return null;

  const name = source.companyName.trim();
  if (name.length < 3 || name.length > 130) return null;
  const text = [source.title, source.excerpt].join(' ').replace(/\s+/g, ' ');
  if (!METAL_CONTEXT.test(text)) return null;

  const selecting = SOFTWARE_SELECTION.test(text) || SELECTION_REVERSE.test(text);
  const pain = OPERATIONAL_PAIN.test(text);
  if (!selecting && !pain) return null;

  let publishedAt: string | undefined;
  if (source.publishedAt) {
    const date = new Date(source.publishedAt);
    if (!Number.isNaN(date.getTime()) && date <= now) {
      const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
      if (ageDays > 730) return null;
      publishedAt = date.toISOString();
    }
  }

  const type: ErpSignalType = selecting ? 'software_selection' : 'operational_pain';
  // Search-result excerpts are only clues. Freshness is not asserted without a parseable date.
  const score = Math.max(0, (selecting ? 80 : 65) - (!publishedAt ? 15 : 0));

  return {
    type, score, evidenceUrl: source.sourceUrl,
    evidenceExcerpt: source.excerpt.slice(0, 600),
    publishedAt, verification: 'search_excerpt',
  };
}
