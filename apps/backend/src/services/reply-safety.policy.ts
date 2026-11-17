/**
 * Deterministic high-confidence opt-out guard. This runs before AI classification,
 * so a model cannot accidentally turn "unsubscribe" into a sales objection.
 * Everything else is left to the intent classifier / human review.
 */
export function explicitContactStop(body: string): 'UNSUBSCRIBE' | 'NEGATIVE' | null {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (/\b(?:unsubscribe|stop (?:emailing|contacting|messaging) me|do not (?:email|contact|message) me|don't (?:email|contact|message) me|remove me from (?:your|the) (?:mailing |email )?list|take me off (?:your|the) (?:mailing |email )?list)\b/i.test(normalized)) {
    return 'UNSUBSCRIBE';
  }
  if (/^(?:no thanks[,.\s]*)?(?:not interested|we are not interested)[.!]*$/i.test(normalized) ||
      /\bplease (?:don't|do not) (?:follow up|contact us again)\b/i.test(normalized)) {
    return 'NEGATIVE';
  }
  return null;
}
