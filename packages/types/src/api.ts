import { z } from "zod";
import { ReminderSourceSchema, ReminderStatusSchema, type Reminder } from "./reminder";

/** Shape of a row in the `reminders` table (snake_case, as returned by PostgREST). */
export const ReminderRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  text: z.string(),
  source: ReminderSourceSchema,
  status: ReminderStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  next_reminder_at: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

export type ReminderRow = z.infer<typeof ReminderRowSchema>;

/** Postgres returns `+00:00` offsets and microseconds; normalise to JS ISO strings. */
function normalizeTimestamp(value: string): string;
function normalizeTimestamp(value: string | null): string | null;
function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${value}`);
  return new Date(ms).toISOString();
}

export function reminderFromRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    source: row.source,
    status: row.status,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
    nextReminderAt: normalizeTimestamp(row.next_reminder_at),
    startedAt: normalizeTimestamp(row.started_at),
    completedAt: normalizeTimestamp(row.completed_at),
  };
}

export function reminderToRow(reminder: Reminder): ReminderRow {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    text: reminder.text,
    source: reminder.source,
    status: reminder.status,
    created_at: reminder.createdAt,
    updated_at: reminder.updatedAt,
    next_reminder_at: reminder.nextReminderAt ?? null,
    started_at: reminder.startedAt ?? null,
    completed_at: reminder.completedAt ?? null,
  };
}
