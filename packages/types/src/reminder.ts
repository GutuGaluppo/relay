import { z } from "zod";

export const REMINDER_STATUSES = ["inbox", "pending", "active", "done", "archived"] as const;
export const REMINDER_SOURCES = ["text", "voice"] as const;

export const ReminderStatusSchema = z.enum(REMINDER_STATUSES);
export const ReminderSourceSchema = z.enum(REMINDER_SOURCES);

export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export type ReminderSource = z.infer<typeof ReminderSourceSchema>;

/** ISO-8601 timestamp with explicit offset (always stored in UTC). */
const Timestamp = z.iso.datetime({ offset: true });

export const MAX_REMINDER_TEXT_LENGTH = 2000;

export const ReminderTextSchema = z.string().trim().min(1).max(MAX_REMINDER_TEXT_LENGTH);

export const ReminderSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  text: ReminderTextSchema,
  source: ReminderSourceSchema,
  status: ReminderStatusSchema,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  nextReminderAt: Timestamp.nullable().optional(),
  startedAt: Timestamp.nullable().optional(),
  completedAt: Timestamp.nullable().optional(),
});

export type Reminder = z.infer<typeof ReminderSchema>;
