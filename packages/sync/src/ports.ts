import type { Reminder } from "@relay/types";

/** Minimal async key/value storage (Tauri store, AsyncStorage, in-memory for tests). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export type RealtimeHandlers = {
  onUpsert(reminder: Reminder): void;
  onDelete(id: string): void;
  onStatus(status: RealtimeStatus): void;
};

/** The cloud side of synchronisation. Implementations must be idempotent. */
export interface ReminderRemote {
  fetchAll(userId: string): Promise<Reminder[]>;
  /** Insert-or-update by id. The server keeps whichever version has the newer `updatedAt`. */
  upsert(reminders: readonly Reminder[]): Promise<void>;
  subscribe(userId: string, handlers: RealtimeHandlers): () => void;
}

export interface SyncLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export const consoleLogger: SyncLogger = {
  info: (m, d) => console.info(`[sync] ${m}`, d ?? ""),
  warn: (m, d) => console.warn(`[sync] ${m}`, d ?? ""),
  error: (m, d) => console.error(`[sync] ${m}`, d ?? ""),
};

export class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}
