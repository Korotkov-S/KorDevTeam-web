export function isSubmissionWindow(now: Date): boolean {
  const m = new Date(now.getTime() + 10800000),
    minutes = m.getUTCHours() * 60 + m.getUTCMinutes();
  return minutes >= 30 && minutes < 360;
}
export function nextRetryAt(input: {
  now: Date;
  attempt: number;
  retryAfterSeconds?: number;
}): Date {
  const delay = [600, 1800, 7200][Math.min(2, Math.max(0, input.attempt - 1))];
  return new Date(
    input.now.getTime() + Math.max(delay, input.retryAfterSeconds ?? 0) * 1000,
  );
}
export function planExpired(plan: { expiresAt: Date }, now: Date): boolean {
  return now >= plan.expiresAt;
}
export function nextSubmissionWindow(now: Date): Date {
  const m = new Date(now.getTime() + 10800000);
  const start = new Date(
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate(), 0, 30) -
      10800000,
  );
  return start > now ? start : new Date(start.getTime() + 86400000);
}
