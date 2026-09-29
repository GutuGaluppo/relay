import type { Reminder } from "@relay/types";
import type { RealtimeHandlers, ReminderRemote } from "../src";

/** In-memory server with the same last-writer-wins semantics as the SQL trigger. */
export class FakeRemote implements ReminderRemote {
  rows = new Map<string, Reminder>();
  online = true;
  upsertCalls = 0;
  private subscribers = new Set<RealtimeHandlers>();

  async fetchAll(userId: string): Promise<Reminder[]> {
    this.assertOnline();
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  async upsert(reminders: readonly Reminder[]): Promise<void> {
    this.assertOnline();
    this.upsertCalls += 1;
    for (const r of reminders) this.write(r);
  }

  /** A write from another device. */
  write(r: Reminder): void {
    const existing = this.rows.get(r.id);
    if (existing && Date.parse(r.updatedAt) <= Date.parse(existing.updatedAt)) return;
    this.rows.set(r.id, r);
    for (const s of this.subscribers) s.onUpsert(r);
  }

  subscribe(_userId: string, handlers: RealtimeHandlers): () => void {
    this.subscribers.add(handlers);
    handlers.onStatus("connected");
    return () => this.subscribers.delete(handlers);
  }

  emitRaw(r: Reminder): void {
    for (const s of this.subscribers) s.onUpsert(r);
  }

  private assertOnline() {
    if (!this.online) throw new Error("network unavailable");
  }
}
