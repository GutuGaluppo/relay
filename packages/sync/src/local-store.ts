import { ReminderSchema, type Reminder } from "@relay/types";
import type { KeyValueStorage, SyncLogger } from "./ports";

type Snapshot = {
  version: 1;
  userId: string;
  reminders: Reminder[];
  /** Ids changed locally that the server has not acknowledged yet. */
  outbox: string[];
  lastSyncedAt: string | null;
};

const KEY = "relay.reminders.v1";

/** Offline-safe local copy of the user's reminders plus the pending-upload outbox. */
export class LocalReminderStore {
  private reminders = new Map<string, Reminder>();
  private outbox = new Set<string>();
  lastSyncedAt: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly userId: string,
    private readonly logger: SyncLogger,
  ) {}

  async load(): Promise<void> {
    const raw = await this.storage.getItem(KEY);
    if (!raw) return;
    try {
      const snap = JSON.parse(raw) as Snapshot;
      if (snap.version !== 1 || snap.userId !== this.userId) {
        this.logger.info("discarding local snapshot for a different user or version");
        return;
      }
      for (const item of snap.reminders) {
        const parsed = ReminderSchema.safeParse(item);
        if (parsed.success) this.reminders.set(parsed.data.id, parsed.data);
        else this.logger.warn("dropping invalid local reminder", parsed.error.issues);
      }
      this.outbox = new Set(snap.outbox.filter((id) => this.reminders.has(id)));
      this.lastSyncedAt = snap.lastSyncedAt;
    } catch (err) {
      this.logger.error("failed to read local snapshot", err);
    }
  }

  all(): Reminder[] {
    return [...this.reminders.values()];
  }

  get(id: string): Reminder | undefined {
    return this.reminders.get(id);
  }

  unsyncedIds(): ReadonlySet<string> {
    return this.outbox;
  }

  unsynced(): Reminder[] {
    return [...this.outbox].flatMap((id) => this.reminders.get(id) ?? []);
  }

  /** Local change: store and queue for upload. */
  putLocal(reminder: Reminder): void {
    this.reminders.set(reminder.id, reminder);
    this.outbox.add(reminder.id);
  }

  /** Server-originated state; does not enqueue an upload. */
  putRemote(reminder: Reminder): void {
    this.reminders.set(reminder.id, reminder);
  }

  remove(id: string): void {
    this.reminders.delete(id);
    this.outbox.delete(id);
  }

  replaceAll(reminders: readonly Reminder[]): void {
    this.reminders = new Map(reminders.map((r) => [r.id, r]));
    for (const id of this.outbox) if (!this.reminders.has(id)) this.outbox.delete(id);
  }

  /** Acknowledge an upload, unless the item changed again while it was in flight. */
  markSynced(sent: readonly Reminder[]): void {
    for (const r of sent) {
      if (this.reminders.get(r.id)?.updatedAt === r.updatedAt) this.outbox.delete(r.id);
    }
  }

  /** Serialised writes so a slow disk never reorders snapshots. */
  persist(): Promise<void> {
    const snap: Snapshot = {
      version: 1,
      userId: this.userId,
      reminders: this.all(),
      outbox: [...this.outbox],
      lastSyncedAt: this.lastSyncedAt,
    };
    const json = JSON.stringify(snap);
    this.writeChain = this.writeChain
      .then(() => this.storage.setItem(KEY, json))
      .catch((err) => this.logger.error("failed to persist local snapshot", err));
    return this.writeChain;
  }

  async clear(): Promise<void> {
    this.reminders.clear();
    this.outbox.clear();
    this.lastSyncedAt = null;
    await this.storage.removeItem(KEY);
  }
}
