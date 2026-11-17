export interface DueFollowUp {
  status: string;
  followUpAt: Date | null;
  intent: string | null;
  suppressedAt?: Date | null;
}

/** Only a prospect's explicit NOT_NOW reply with a due date can be followed up. */
export function isPermittedDueFollowUp(item: DueFollowUp, now = new Date()): boolean {
  return item.status === 'FOLLOW_UP_SCHEDULED' &&
    item.intent === 'NOT_NOW' &&
    !item.suppressedAt &&
    item.followUpAt instanceof Date &&
    !Number.isNaN(item.followUpAt.getTime()) &&
    item.followUpAt.getTime() <= now.getTime();
}
