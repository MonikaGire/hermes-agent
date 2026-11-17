import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxPollWindow } from '../apps/backend/src/jobs/reply-poll-policy.ts';
import { isPermittedDueFollowUp } from '../apps/backend/src/services/follow-up-policy.ts';
import { explicitContactStop } from '../apps/backend/src/services/reply-safety.policy.ts';
import { plainTextToSafeHtml } from '../apps/backend/src/utils/email-content.ts';

const now = new Date('2026-11-17T12:00:00.000Z');

test('inbox polls overlap and checkpoint at START of poll, not after', () => {
  const { since, checkpoint } = inboxPollWindow('2026-11-17T11:00:00Z', now);
  assert.equal(since.toISOString(), '2026-11-17T10:50:00.000Z');
  assert.equal(checkpoint.toISOString(), now.toISOString());
});

test('invalid/future inbox checkpoint safely starts from the previous day', () => {
  for (const value of [null, 'garbage', '2030-01-01']) {
    const { since, checkpoint } = inboxPollWindow(value, now);
    assert.equal(since.toISOString(), '2026-11-16T11:50:00.000Z');
    assert.equal(checkpoint.toISOString(), now.toISOString());
  }
});

test('follow-up must be explicitly invited and due, not an arbitrary drip campaign', () => {
  const due = { status: 'FOLLOW_UP_SCHEDULED', intent: 'NOT_NOW', followUpAt: new Date('2026-11-17T11:00:00Z'), suppressedAt: null };
  assert.equal(isPermittedDueFollowUp(due, now), true);
  assert.equal(isPermittedDueFollowUp({ ...due, followUpAt: new Date('2026-11-18') }, now), false);
  assert.equal(isPermittedDueFollowUp({ ...due, intent: 'OBJECTION' }, now), false);
  assert.equal(isPermittedDueFollowUp({ ...due, status: 'SUPPRESSED' }, now), false);
  assert.equal(isPermittedDueFollowUp({ ...due, suppressedAt: new Date() }, now), false);
  assert.equal(isPermittedDueFollowUp({ ...due, followUpAt: new Date('invalid') }, now), false);
});

test('explicit opt-outs override AI interpretation', () => {
  assert.equal(explicitContactStop('Please unsubscribe me'), 'UNSUBSCRIBE');
  assert.equal(explicitContactStop('Remove me from your list.'), 'UNSUBSCRIBE');
  assert.equal(explicitContactStop("Don't email me again."), 'UNSUBSCRIBE');
  assert.equal(explicitContactStop('Not interested.'), 'NEGATIVE');
  assert.equal(explicitContactStop('Please do not follow up.'), 'NEGATIVE');
});

test('does not misread business process complaints as unsubscribe requests', () => {
  assert.equal(explicitContactStop('We need to stop production delays, not emails.'), null);
  assert.equal(explicitContactStop('Not interested in a replacement; integration could help.'), null);
  assert.equal(explicitContactStop('Maybe discuss it next quarter.'), null);
});

test('raw email drafts cannot inject HTML into SMTP body', () => {
  const result = plainTextToSafeHtml('<script>alert("x")</script>\nA&B');
  assert.equal(result, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>A&amp;B');
});
