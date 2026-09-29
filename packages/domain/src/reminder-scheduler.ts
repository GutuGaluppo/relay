import type { Reminder } from "@relay/types";
import { toMs } from "./time";

export type DueContext = {
  now: Date;
  /**
   * True at deliberate moments — app start, login, unlock, wake from sleep, or when
   * the user explicitly opens pending reminders. Items without a scheduled time
   * (fresh captures) are only surfaced at these moments.
   */
  intentionalMoment: boolean;
};

/** The instant a reminder became (or becomes) eligible, used for ordering. */
function dueTimeMs(reminder: Reminder): number {
  return reminder.nextReminderAt ? toMs(reminder.nextReminderAt) : toMs(reminder.createdAt);
}

export function isOverdue(reminder: Reminder, now: Date): boolean {
  return (
    reminder.status === "pending" &&
    reminder.nextReminderAt != null &&
    toMs(reminder.nextReminderAt) <= now.getTime()
  );
}

export function isDue(reminder: Reminder, ctx: DueContext): boolean {
  if (isOverdue(reminder, ctx.now)) return true;
  const unscheduled =
    reminder.status === "inbox" || (reminder.status === "pending" && !reminder.nextReminderAt);
  return unscheduled && ctx.intentionalMoment;
}

/** All due reminders, oldest due first. */
export function dueReminders(reminders: readonly Reminder[], ctx: DueContext): Reminder[] {
  return reminders
    .filter((r) => isDue(r, ctx))
    .sort((a, b) => dueTimeMs(a) - dueTimeMs(b) || toMs(a.createdAt) - toMs(b.createdAt));
}

/** The single reminder to show next — Relay never stacks reminders. */
export function selectNextDue(
  reminders: readonly Reminder[],
  ctx: DueContext,
): Reminder | undefined {
  return dueReminders(reminders, ctx)[0];
}

/** Earliest future `nextReminderAt`; lets callers arm a timer as an optimisation only. */
export function nextScheduledAt(reminders: readonly Reminder[], now: Date): string | undefined {
  let best: number | undefined;
  for (const r of reminders) {
    if (r.status !== "pending" || !r.nextReminderAt) continue;
    const t = toMs(r.nextReminderAt);
    if (t > now.getTime() && (best === undefined || t < best)) best = t;
  }
  return best === undefined ? undefined : new Date(best).toISOString();
}

export function findActive(reminders: readonly Reminder[]): Reminder | undefined {
  return reminders
    .filter((r) => r.status === "active")
    .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))[0];
}

export function elapsedMs(reminder: Reminder, now: Date): number {
  if (!reminder.startedAt) return 0;
  return Math.max(0, now.getTime() - toMs(reminder.startedAt));
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Pending/active items for the inbox view, and done/archived for history. */
export function partitionReminders(reminders: readonly Reminder[]): {
  open: Reminder[];
  history: Reminder[];
} {
  const open = reminders
    .filter((r) => r.status === "inbox" || r.status === "pending" || r.status === "active")
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  const history = reminders
    .filter((r) => r.status === "done" || r.status === "archived")
    .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
  return { open, history };
}
