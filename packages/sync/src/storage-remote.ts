import { ReminderSchema, type Reminder } from "@relay/types";
import type { KeyValueStorage, RealtimeHandlers, ReminderRemote } from "./ports";

const KEY = "relay.local-remote.v1";

/**
 * A "server" that lives in local storage. Used for local mode (no Supabase
 * configured) so the desktop app is fully usable offline during development.
 * Applies the same last-writer-wins rule as the database.
 */
export class StorageReminderRemote implements ReminderRemote {
  constructor(private readonly storage: KeyValueStorage) {}

  private async read(): Promise<Map<string, Reminder>> {
    const raw = await this.storage.getItem(KEY);
    const map = new Map<string, Reminder>();
    if (!raw) return map;
    for (const item of JSON.parse(raw) as unknown[]) {
      const parsed = ReminderSchema.safeParse(item);
      if (parsed.success) map.set(parsed.data.id, parsed.data);
    }
    return map;
  }

  async fetchAll(userId: string): Promise<Reminder[]> {
    return [...(await this.read()).values()].filter((r) => r.userId === userId);
  }

  async upsert(reminders: readonly Reminder[]): Promise<void> {
    const rows = await this.read();
    for (const r of reminders) {
      const existing = rows.get(r.id);
      if (existing && Date.parse(r.updatedAt) <= Date.parse(existing.updatedAt)) continue;
      rows.set(r.id, r);
    }
    await this.storage.setItem(KEY, JSON.stringify([...rows.values()]));
  }

  subscribe(_userId: string, handlers: RealtimeHandlers): () => void {
    handlers.onStatus("connected");
    return () => {};
  }
}
