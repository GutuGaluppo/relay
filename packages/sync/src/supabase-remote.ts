import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderFromRow, reminderToRow, ReminderRowSchema, type Reminder } from "@relay/types";
import type { RealtimeHandlers, ReminderRemote, SyncLogger } from "./ports";
import { consoleLogger } from "./ports";

const TABLE = "reminders";

function parseRows(rows: unknown[], logger: SyncLogger): Reminder[] {
  const out: Reminder[] = [];
  for (const row of rows) {
    const parsed = ReminderRowSchema.safeParse(row);
    if (parsed.success) out.push(reminderFromRow(parsed.data));
    else logger.warn("ignoring malformed reminder row", parsed.error.issues);
  }
  return out;
}

export class SupabaseReminderRemote implements ReminderRemote {
  constructor(
    private readonly client: SupabaseClient,
    private readonly logger: SyncLogger = consoleLogger,
  ) {}

  async fetchAll(userId: string): Promise<Reminder[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return parseRows(data ?? [], this.logger);
  }

  async upsert(reminders: readonly Reminder[]): Promise<void> {
    if (reminders.length === 0) return;
    // `upsert_reminders` applies last-writer-wins per row; see the migration.
    const { error } = await this.client.rpc("upsert_reminders", {
      items: reminders.map(reminderToRow),
    });
    if (error) throw new Error(error.message);
  }

  subscribe(userId: string, handlers: RealtimeHandlers): () => void {
    handlers.onStatus("connecting");
    const channel = this.client
      .channel(`reminders:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) handlers.onDelete(id);
            return;
          }
          const [reminder] = parseRows([payload.new], this.logger);
          if (reminder) handlers.onUpsert(reminder);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") handlers.onStatus("connected");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          handlers.onStatus("disconnected");
        }
      });
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
