import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Reminder } from "@relay/types";
import { ReminderSchema } from "@relay/types";
import {
  archiveReminder,
  completeReminder,
  createReminder,
  dismissInitial,
  dueReminders,
  elapsedMs,
  findActive,
  formatElapsed,
  InvalidTransitionError,
  isOverdue,
  nextScheduledAt,
  notYet,
  promptKind,
  restoreReminder,
  returnToPending,
  selectNextDue,
  snoozeReminder,
  startReminder,
} from "../src";

const USER = "00000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-03-10T12:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let seq = 0;
function make(overrides: Partial<Reminder> = {}, now = T0): Reminder {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return {
    ...createReminder({ id, userId: USER, text: "Preparar proposta", source: "text", now }),
    ...overrides,
  };
}

describe("createReminder", () => {
  it("creates a valid inbox reminder", () => {
    const r = make();
    expect(r.status).toBe("inbox");
    expect(r.nextReminderAt).toBeNull();
    expect(ReminderSchema.parse(r)).toEqual(r);
    expect(promptKind(r)).toBe("initial");
  });

  it("trims text and rejects empty text", () => {
    expect(
      createReminder({ id: "x", userId: USER, text: "  oi  ", source: "voice", now: T0 }).text,
    ).toBe("oi");
    expect(() =>
      createReminder({ id: "x", userId: USER, text: "   ", source: "text", now: T0 }),
    ).toThrow();
  });
});

describe("transitions", () => {
  it("Agora não → pending in 2 hours", () => {
    const r = dismissInitial(make(), T0);
    expect(r.status).toBe("pending");
    expect(r.nextReminderAt).toBe(at(120).toISOString());
    expect(promptKind(r)).toBe("follow-up");
  });

  it("Ainda não → +90 minutes", () => {
    const r = notYet(dismissInitial(make(), T0), at(120));
    expect(r.nextReminderAt).toBe(at(210).toISOString());
  });

  it("respects custom rules", () => {
    const rules = { initialDismissMs: 60_000, notYetMs: 120_000, tomorrowHour: 8 };
    expect(dismissInitial(make(), T0, rules).nextReminderAt).toBe(at(1).toISOString());
    expect(notYet(make(), T0, rules).nextReminderAt).toBe(at(2).toISOString());
  });

  it("start → active with startedAt, clears schedule", () => {
    const r = startReminder(dismissInitial(make(), T0), at(5));
    expect(r.status).toBe("active");
    expect(r.startedAt).toBe(at(5).toISOString());
    expect(r.nextReminderAt).toBeNull();
  });

  it("active → pending via Adiar", () => {
    const active = startReminder(make(), T0);
    const r = returnToPending(active, { kind: "duration", minutes: 30 }, at(10));
    expect(r.status).toBe("pending");
    expect(r.startedAt).toBeNull();
    expect(r.nextReminderAt).toBe(at(40).toISOString());
  });

  it("complete → done", () => {
    const r = completeReminder(startReminder(make(), T0), at(25));
    expect(r.status).toBe("done");
    expect(r.completedAt).toBe(at(25).toISOString());
  });

  it("archive and restore", () => {
    const archived = archiveReminder(dismissInitial(make(), T0), at(1));
    expect(archived.status).toBe("archived");
    const restored = restoreReminder(archived, at(2));
    expect(restored.status).toBe("inbox");
    expect(restored.completedAt).toBeNull();
  });

  it("rejects invalid transitions", () => {
    const done = completeReminder(make(), T0);
    expect(() => startReminder(done, T0)).toThrow(InvalidTransitionError);
    expect(() => archiveReminder(done, T0)).toThrow(InvalidTransitionError);
    expect(() => returnToPending(make(), { kind: "tomorrow" }, T0)).toThrow(InvalidTransitionError);
    expect(() => restoreReminder(make(), T0)).toThrow(InvalidTransitionError);
    expect(() => snoozeReminder(startReminder(make(), T0), { kind: "tomorrow" }, T0)).toThrow(
      InvalidTransitionError,
    );
  });

  it("updatedAt always increases, even if the local clock is behind", () => {
    const future = make({ updatedAt: at(60).toISOString() });
    const r = dismissInitial(future, T0);
    expect(Date.parse(r.updatedAt)).toBeGreaterThan(Date.parse(future.updatedAt));
  });
});

describe("snooze options", () => {
  it.each([30, 60, 120])("%i minutes", (minutes) => {
    expect(snoozeReminder(make(), { kind: "duration", minutes }, T0).nextReminderAt).toBe(
      at(minutes).toISOString(),
    );
  });

  it("rejects non-positive durations and past custom times", () => {
    expect(() => snoozeReminder(make(), { kind: "duration", minutes: 0 }, T0)).toThrow();
    expect(() => snoozeReminder(make(), { kind: "until", at: at(-1).toISOString() }, T0)).toThrow();
  });

  it("custom time is normalised to UTC ISO", () => {
    const r = snoozeReminder(make(), { kind: "until", at: "2026-03-10T15:30:00-03:00" }, T0);
    expect(r.nextReminderAt).toBe("2026-03-10T18:30:00.000Z");
  });
});

describe("tomorrow in local time zones", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("uses 09:00 local in São Paulo", () => {
    process.env.TZ = "America/Sao_Paulo";
    // 23:30 local on Mar 10 (02:30Z Mar 11) → 09:00 local Mar 11 (12:00Z)
    const now = new Date("2026-03-11T02:30:00.000Z");
    expect(snoozeReminder(make({}, now), { kind: "tomorrow" }, now).nextReminderAt).toBe(
      "2026-03-11T12:00:00.000Z",
    );
  });

  it("keeps 09:00 wall-clock across a DST change", () => {
    process.env.TZ = "America/New_York";
    // Mar 7 2026 12:00 EST; DST starts Mar 8 → 09:00 EDT = 13:00Z
    const now = new Date("2026-03-07T17:00:00.000Z");
    expect(snoozeReminder(make({}, now), { kind: "tomorrow" }, now).nextReminderAt).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });
});

describe("scheduler", () => {
  beforeEach(() => {
    seq = 100;
  });

  it("detects overdue pending reminders only", () => {
    const pending = dismissInitial(make(), T0);
    expect(isOverdue(pending, at(119))).toBe(false);
    expect(isOverdue(pending, at(120))).toBe(true);
    expect(isOverdue(startReminder(make(), T0), at(500))).toBe(false);
  });

  it("surfaces fresh captures only at intentional moments", () => {
    const inbox = make();
    expect(dueReminders([inbox], { now: at(1), intentionalMoment: false })).toEqual([]);
    expect(dueReminders([inbox], { now: at(1), intentionalMoment: true })).toEqual([inbox]);
  });

  it("returns the oldest due reminder first", () => {
    const a = dismissInitial(make({}, at(-300)), at(-200)); // due at -80
    const b = dismissInitial(make({}, at(-400)), at(-150)); // due at -30
    const c = make({}, at(-10)); // inbox, created -10
    const list = [c, b, a];
    expect(selectNextDue(list, { now: T0, intentionalMoment: true })?.id).toBe(a.id);
    expect(dueReminders(list, { now: T0, intentionalMoment: true }).map((r) => r.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  it("computes the next scheduled time", () => {
    const a = dismissInitial(make(), T0);
    const b = notYet(make(), T0);
    expect(nextScheduledAt([a, b], T0)).toBe(at(90).toISOString());
    expect(nextScheduledAt([a, b], at(200))).toBeUndefined();
  });

  it("finds the active reminder and formats elapsed time", () => {
    const active = startReminder(make(), T0);
    expect(findActive([make(), active])?.id).toBe(active.id);
    expect(formatElapsed(elapsedMs(active, new Date(T0.getTime() + 1_458_000)))).toBe("00:24:18");
  });
});
