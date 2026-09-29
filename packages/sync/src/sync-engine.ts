import type { Reminder } from "@relay/types";
import { LocalReminderStore } from "./local-store";
import { pickNewer, reconcile } from "./reconciliation";
import type { KeyValueStorage, RealtimeStatus, ReminderRemote, SyncLogger } from "./ports";
import { consoleLogger } from "./ports";

export type SyncState = {
  reminders: Reminder[];
  pendingUploads: number;
  realtime: RealtimeStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type SyncEngineOptions = {
  userId: string;
  remote: ReminderRemote;
  storage: KeyValueStorage;
  logger?: SyncLogger;
  /** Mobile only pushes captures; desktop also pulls and listens for changes. */
  mode?: "full" | "push-only";
  /** Periodic reconciliation — realtime is an optimisation, never the only path. */
  reconcileIntervalMs?: number;
  now?: () => Date;
};

type Listener = (state: SyncState) => void;
/** Reasons a caller may wake the engine; logged for diagnosis. */
export type SyncTrigger = "start" | "interval" | "resume" | "online" | "realtime" | "manual";

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;

export class SyncEngine {
  private readonly store: LocalReminderStore;
  private readonly logger: SyncLogger;
  private readonly listeners = new Set<Listener>();
  private readonly mode: "full" | "push-only";
  private realtime: RealtimeStatus = "disconnected";
  private lastError: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private retryId: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private flushing: Promise<boolean> | null = null;
  private reconciling: Promise<void> | null = null;
  private rerunRequested = false;
  private started = false;

  constructor(private readonly opts: SyncEngineOptions) {
    this.logger = opts.logger ?? consoleLogger;
    this.mode = opts.mode ?? "full";
    this.store = new LocalReminderStore(opts.storage, opts.userId, this.logger);
  }

  get userId(): string {
    return this.opts.userId;
  }

  /** Load local state immediately so the app works offline, then sync in the background. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.store.load();
    this.emit();

    if (this.mode === "full") {
      this.unsubscribe = this.opts.remote.subscribe(this.opts.userId, {
        onUpsert: (r) => this.applyRemote(r),
        onDelete: (id) => {
          this.store.remove(id);
          void this.store.persist();
          this.emit();
        },
        onStatus: (status) => {
          const wasConnected = this.realtime === "connected";
          this.realtime = status;
          this.emit();
          // Events may have been missed while disconnected.
          if (status === "connected" && !wasConnected) void this.sync("realtime");
        },
      });
    }
    const interval = this.opts.reconcileIntervalMs ?? 60_000;
    if (interval > 0) this.intervalId = setInterval(() => void this.sync("interval"), interval);
    void this.sync("start");
  }

  stop(): void {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.retryId) clearTimeout(this.retryId);
    this.intervalId = null;
    this.retryId = null;
    this.listeners.clear();
  }

  /** Stop and wipe local data (sign-out). */
  async reset(): Promise<void> {
    this.stop();
    await this.store.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return {
      reminders: this.store.all(),
      pendingUploads: this.store.unsyncedIds().size,
      realtime: this.realtime,
      lastSyncedAt: this.store.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  get(id: string): Reminder | undefined {
    return this.store.get(id);
  }

  /** Save a locally produced version (new capture or domain action result). */
  async save(reminder: Reminder): Promise<void> {
    if (reminder.userId !== this.opts.userId) throw new Error("Reminder belongs to another user");
    this.store.putLocal(reminder);
    await this.store.persist();
    this.emit();
    void this.flush();
  }

  /**
   * Push the outbox, then (in full mode) reconcile with the server snapshot.
   * Calls made while a sync is running are coalesced into one follow-up run, so a
   * trigger such as "online" is never swallowed by an attempt that already failed.
   */
  async sync(trigger: SyncTrigger = "manual"): Promise<void> {
    if (!this.started) return;
    if (this.reconciling) {
      this.rerunRequested = true;
      return this.reconciling;
    }
    this.reconciling = (async () => {
      do {
        this.rerunRequested = false;
        await this.flush();
        // Pull even if the push failed: reconciliation never discards unsynced items.
        if (this.mode === "full") await this.pull(trigger);
      } while (this.rerunRequested && this.started);
    })().finally(() => {
      this.reconciling = null;
    });
    return this.reconciling;
  }

  /** Upload unsynced changes. Resolves true when the outbox is empty afterwards. */
  flush(): Promise<boolean> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<boolean> {
    const batch = this.store.unsynced();
    if (batch.length === 0) return true;
    try {
      await this.opts.remote.upsert(batch);
      this.store.markSynced(batch);
      if (this.mode === "push-only") {
        // A capture device keeps nothing it no longer needs to deliver.
        const waiting = this.store.unsyncedIds();
        for (const r of batch) if (!waiting.has(r.id)) this.store.remove(r.id);
      }
      this.lastError = null;
      this.retryAttempt = 0;
      await this.store.persist();
      this.emit();
      if (this.store.unsyncedIds().size > 0) return this.doFlush();
      return true;
    } catch (err) {
      this.fail("upload failed", err);
      this.scheduleRetry();
      return false;
    }
  }

  private async pull(trigger: SyncTrigger): Promise<void> {
    try {
      const remote = await this.opts.remote.fetchAll(this.opts.userId);
      const merged = reconcile(this.store.all(), remote, this.store.unsyncedIds());
      this.store.replaceAll(merged);
      this.store.lastSyncedAt = this.now().toISOString();
      this.lastError = null;
      await this.store.persist();
      this.emit();
      this.logger.info(`reconciled (${trigger})`, { count: merged.length });
    } catch (err) {
      this.fail(`reconcile failed (${trigger})`, err);
    }
  }

  private applyRemote(incoming: Reminder): void {
    if (incoming.userId !== this.opts.userId) return;
    const local = this.store.get(incoming.id);
    const winner = pickNewer(local, incoming);
    if (winner === local) return; // duplicate or stale event
    this.store.putRemote(winner);
    void this.store.persist();
    this.emit();
  }

  private scheduleRetry(): void {
    if (this.retryId || !this.started) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retryAttempt);
    this.retryAttempt += 1;
    this.retryId = setTimeout(() => {
      this.retryId = null;
      void this.sync("manual");
    }, delay);
  }

  private fail(message: string, err: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err);
    this.logger.warn(message, this.lastError);
    this.emit();
  }

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  private emit(): void {
    const state = this.getState();
    for (const l of this.listeners) l(state);
  }
}
