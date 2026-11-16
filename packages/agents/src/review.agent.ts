import type { AgentResult, GeneratedEmail, ReviewScores } from '@hermes/shared';
import { EMAIL_WORD_MIN, EMAIL_WORD_MAX, REVIEW_SCORE_THRESHOLD, BANNED_PHRASES, countWords } from '@hermes/shared';
import { BaseAgent } from './base.agent.js';

export interface ReviewInput {
  email: GeneratedEmail;
  companyContext: string;
  contactContext: string;
}

export interface ReviewOutput {
  scores: ReviewScores;
  passed: boolean;
  feedback: string[];
  suggestions: string[];
  revisedEmail?: Partial<GeneratedEmail>;
}

const SYSTEM_PROMPT = `You are a critical email quality reviewer for B2B manufacturing ERP sales outreach.

SCORING CRITERIA (1-10 each, threshold to pass: ${REVIEW_SCORE_THRESHOLD}):

1. Research Relevance (1-10): Does the email reference specific, accurate details about the company?
   - 10: Uses 2+ specific verified company facts
   - 5: Generic industry reference
   - 1: No company-specific content

2. Personalization (1-10): Is this genuinely personalized vs. template fill-in?
   - 10: Could only be sent to this specific person/company
   - 5: Has name/company but feels templated
   - 1: Mass email template

3. Human Tone (1-10): Does it sound like a real person wrote it?
   - 10: Conversational, natural, zero AI-speak
   - 5: Mostly human but has clichés
   - 1: Obvious AI / marketing language

4. Business Value (1-10): Does it connect to real business outcomes?
   - 10: Specific quantifiable outcome tied to their situation
   - 5: General ERP benefit mentioned
   - 1: Feature pitch with no business outcome

5. Reply Probability (1-10): Would you reply to this email?
   - 10: Genuinely curious, compelling question
   - 5: Maybe, if you have time
   - 1: Delete immediately

AUTOMATIC FAIL conditions:
${BANNED_PHRASES.map((p) => `- Contains: "${p}"`).join('\n')}
- Word count outside ${EMAIL_WORD_MIN}–${EMAIL_WORD_MAX} words
- Mentions competitor ERP products
- Makes promises or guarantees
- Uses superlatives (best, fastest, most powerful)

Output valid JSON only.`;

export class ReviewAgent extends BaseAgent<ReviewInput, ReviewOutput> {
  protected readonly agentName = 'ReviewAgent';

  async run(input: ReviewInput): Promise<AgentResult<ReviewOutput>> {
    return this.wrap(async () => {
      const wordCount = countWords(input.email.body);

      // Check banned phrases client-side first for speed
      const bannedFound = BANNED_PHRASES.filter((phrase) =>
        input.email.body.toLowerCase().includes(phrase.toLowerCase()),
      );

      if (wordCount < EMAIL_WORD_MIN || wordCount > EMAIL_WORD_MAX || bannedFound.length > 0) {
        return {
          scores: {
            researchRelevance: 0,
            personalization: 0,
            humanTone: bannedFound.length > 0 ? 1 : 5,
            businessValue: 0,
            replyProbability: 0,
            overall: 0,
          },
          passed: false,
          feedback: [
            ...(wordCount < EMAIL_WORD_MIN ? [`Too short: ${wordCount} words (min ${EMAIL_WORD_MIN})`] : []),
            ...(wordCount > EMAIL_WORD_MAX ? [`Too long: ${wordCount} words (max ${EMAIL_WORD_MAX})`] : []),
            ...(bannedFound.map((p) => `Contains banned phrase: "${p}"`)),
          ],
          suggestions: ['Rewrite the email addressing the above issues'],
        };
      }

      const { content } = await this.chat(
        SYSTEM_PROMPT,
        `Company context: ${input.companyContext}
Contact context: ${input.contactContext}

EMAIL TO REVIEW:
Subject: ${input.email.subject}
Body:
${input.email.body}

Word count: ${wordCount}

Score this email and provide detailed feedback. Return JSON:
{
  "scores": {
    "researchRelevance": 8,
    "personalization": 7,
    "humanTone": 9,
    "businessValue": 8,
    "replyProbability": 7,
    "overall": 7.8
  },
  "passed": true,
  "feedback": ["what's working", "what's not working"],
  "suggestions": ["specific improvement 1", "specific improvement 2"],
  "revisedEmail": null
}

If any score is below ${REVIEW_SCORE_THRESHOLD}, set passed to false and provide a revised email in revisedEmail.`,
        { jsonMode: true, temperature: 0.2 },
      );

      const result = this.parseJSON<ReviewOutput>(content);

      // Recalculate overall as true average
      const scores = result.scores;
      scores.overall = (
        scores.researchRelevance +
        scores.personalization +
        scores.humanTone +
        scores.businessValue +
        scores.replyProbability
      ) / 5;

      result.passed = scores.overall >= REVIEW_SCORE_THRESHOLD &&
        Math.min(
          scores.researchRelevance,
          scores.personalization,
          scores.humanTone,
          scores.businessValue,
          scores.replyProbability,
        ) >= REVIEW_SCORE_THRESHOLD;

      return result;
    });
  }
}
