/**
 * Overlap prevents losing mail between Gmail search, processing, and checkpoint
 * writes. Re-processing is safe because persisted Gmail message IDs are deduped.
 */
export function inboxPollWindow(
  lastCheckpoint: unknown,
  pollStartedAt: Date,
): { since: Date; checkpoint: Date } {
  const time = typeof lastCheckpoint === 'string'
    ? new Date(lastCheckpoint)
    : new Date(Number.NaN);
  const baseline = !Number.isNaN(time.getTime()) && time <= pollStartedAt
    ? time
    : new Date(pollStartedAt.getTime() - 24 * 60 * 60 * 1000);
  return {
    since: new Date(baseline.getTime() - 10 * 60 * 1000),
    checkpoint: pollStartedAt,
  };
}
