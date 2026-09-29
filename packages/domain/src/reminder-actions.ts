import type { Reminder } from "@relay/types";
import { assertStatus, DEFAULT_RULES, nextUpdatedAt, type ReminderRules } from "./reminder";
import { addMs, tomorrowAt, toMs } from "./time";

export type SnoozeOption =
  { kind: "duration"; minutes: number } | { kind: "tomorrow" } | { kind: "until"; at: string };

export const SNOOZE_PRESETS: readonly SnoozeOption[] = [
  { kind: "duration", minutes: 30 },
  { kind: "duration", minutes: 60 },
  { kind: "duration", minutes: 120 },
  { kind: "tomorrow" },
];

export function resolveSnooze(
  option: SnoozeOption,
  now: Date,
  rules: ReminderRules = DEFAULT_RULES,
): string {
  switch (option.kind) {
    case "duration":
      if (!Number.isFinite(option.minutes) || option.minutes <= 0) {
        throw new Error("Snooze duration must be positive");
      }
      return addMs(now, option.minutes * 60_000);
    case "tomorrow":
      return tomorrowAt(now, rules.tomorrowHour);
    case "until": {
      const at = toMs(option.at);
      if (at <= now.getTime()) throw new Error("Custom snooze time must be in the future");
      return new Date(at).toISOString();
    }
  }
}

function toPending(reminder: Reminder, nextReminderAt: string, now: Date): Reminder {
  return {
    ...reminder,
    status: "pending",
    nextReminderAt,
    startedAt: null,
    updatedAt: nextUpdatedAt(reminder, now),
  };
}

/** "Agora não" on the initial reminder: keep it pending, return in 2 hours. */
export function dismissInitial(
  reminder: Reminder,
  now: Date,
  rules: ReminderRules = DEFAULT_RULES,
): Reminder {
  assertStatus(reminder, "dismiss", ["inbox", "pending"]);
  return toPending(reminder, addMs(now, rules.initialDismissMs), now);
}

/** "Ainda não" on a follow-up reminder: return in 90 minutes. */
export function notYet(
  reminder: Reminder,
  now: Date,
  rules: ReminderRules = DEFAULT_RULES,
): Reminder {
  assertStatus(reminder, "defer", ["inbox", "pending"]);
  return toPending(reminder, addMs(now, rules.notYetMs), now);
}

/** "Prorrogar" with an explicit option. */
export function snoozeReminder(
  reminder: Reminder,
  option: SnoozeOption,
  now: Date,
  rules: ReminderRules = DEFAULT_RULES,
): Reminder {
  assertStatus(reminder, "snooze", ["inbox", "pending"]);
  return toPending(reminder, resolveSnooze(option, now, rules), now);
}

/** "Farei agora" / "Iniciar tarefa". */
export function startReminder(reminder: Reminder, now: Date): Reminder {
  assertStatus(reminder, "start", ["inbox", "pending"]);
  return {
    ...reminder,
    status: "active",
    startedAt: now.toISOString(),
    nextReminderAt: null,
    updatedAt: nextUpdatedAt(reminder, now),
  };
}

/** "Adiar" from Focus Mode: active → pending with a chosen snooze. */
export function returnToPending(
  reminder: Reminder,
  option: SnoozeOption,
  now: Date,
  rules: ReminderRules = DEFAULT_RULES,
): Reminder {
  assertStatus(reminder, "postpone", ["active"]);
  return toPending(reminder, resolveSnooze(option, now, rules), now);
}

/** "Concluir". Also allowed from the inbox list for items already handled elsewhere. */
export function completeReminder(reminder: Reminder, now: Date): Reminder {
  assertStatus(reminder, "complete", ["inbox", "pending", "active"]);
  return {
    ...reminder,
    status: "done",
    completedAt: now.toISOString(),
    nextReminderAt: null,
    updatedAt: nextUpdatedAt(reminder, now),
  };
}

export function archiveReminder(reminder: Reminder, now: Date): Reminder {
  assertStatus(reminder, "archive", ["inbox", "pending"]);
  return {
    ...reminder,
    status: "archived",
    nextReminderAt: null,
    updatedAt: nextUpdatedAt(reminder, now),
  };
}

/**
 * Bring a completed or archived item back. It re-enters the inbox, so it is
 * offered again at the next intentional moment, exactly like a fresh capture.
 */
export function restoreReminder(reminder: Reminder, now: Date): Reminder {
  assertStatus(reminder, "restore", ["done", "archived"]);
  return {
    ...reminder,
    status: "inbox",
    nextReminderAt: null,
    startedAt: null,
    completedAt: null,
    updatedAt: nextUpdatedAt(reminder, now),
  };
}
