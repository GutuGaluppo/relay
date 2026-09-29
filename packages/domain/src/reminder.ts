import type { Reminder, ReminderSource, ReminderStatus } from "@relay/types";
import { HOUR_MS, MINUTE_MS } from "./time";

export type ReminderRules = {
  /** "Agora não" on the initial reminder. */
  initialDismissMs: number;
  /** "Ainda não" on a follow-up reminder. */
  notYetMs: number;
  /** Local hour used by the "Amanhã" snooze option. */
  tomorrowHour: number;
};

export const DEFAULT_RULES: ReminderRules = {
  initialDismissMs: 2 * HOUR_MS,
  notYetMs: 90 * MINUTE_MS,
  tomorrowHour: 9,
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly action: string,
    readonly from: ReminderStatus,
  ) {
    super(`Cannot ${action} a reminder with status "${from}"`);
    this.name = "InvalidTransitionError";
  }
}

export function assertStatus(
  reminder: Reminder,
  action: string,
  allowed: readonly ReminderStatus[],
): void {
  if (!allowed.includes(reminder.status)) {
    throw new InvalidTransitionError(action, reminder.status);
  }
}

/**
 * `updatedAt` drives last-writer-wins reconciliation, so it must strictly increase
 * for every local change even if the device clock is behind the previous writer.
 */
export function nextUpdatedAt(reminder: Reminder, now: Date): string {
  const prev = Date.parse(reminder.updatedAt);
  return new Date(Math.max(now.getTime(), prev + 1)).toISOString();
}

export type CreateReminderInput = {
  id: string;
  userId: string;
  text: string;
  source: ReminderSource;
  now: Date;
};

export function createReminder(input: CreateReminderInput): Reminder {
  const text = input.text.trim();
  if (text.length === 0) throw new Error("Reminder text cannot be empty");
  const now = input.now.toISOString();
  return {
    id: input.id,
    userId: input.userId,
    text,
    source: input.source,
    status: "inbox",
    createdAt: now,
    updatedAt: now,
    nextReminderAt: null,
    startedAt: null,
    completedAt: null,
  };
}

export type ReminderPrompt = "initial" | "follow-up";

/** Which reminder UI applies: first contact offers two choices, later ones three. */
export function promptKind(reminder: Reminder): ReminderPrompt {
  return reminder.status === "inbox" ? "initial" : "follow-up";
}
