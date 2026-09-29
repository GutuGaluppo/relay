import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";
import { AppState } from "react-native";
import { createReminder } from "@relay/domain";
import {
  StorageReminderRemote,
  SupabaseReminderRemote,
  SyncEngine,
  type SyncState,
} from "@relay/sync";
import type { ReminderSource } from "@relay/types";
import { storage } from "./storage";
import { supabase } from "./supabase";

/**
 * Capture service: saves locally first (outbox), then uploads. Each capture gets
 * a client-generated id, so retries and double taps never create duplicates.
 */
export class CaptureService {
  private readonly engine: SyncEngine;
  private readonly cleanups: (() => void)[] = [];

  constructor(readonly userId: string) {
    this.engine = new SyncEngine({
      userId,
      remote: supabase ? new SupabaseReminderRemote(supabase) : new StorageReminderRemote(storage),
      storage,
      mode: "push-only",
      reconcileIntervalMs: 30_000,
    });
  }

  async start(): Promise<void> {
    await this.engine.start();
    this.cleanups.push(
      NetInfo.addEventListener((s) => {
        if (s.isConnected) void this.engine.sync("online");
      }),
    );
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void this.engine.sync("resume");
    });
    this.cleanups.push(() => sub.remove());
  }

  stop(): void {
    this.cleanups.splice(0).forEach((c) => c());
    this.engine.stop();
  }

  async signOut(): Promise<void> {
    this.cleanups.splice(0).forEach((c) => c());
    await this.engine.reset();
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    return this.engine.subscribe(listener);
  }

  /** Resolves once the capture is safely stored on the device. */
  async capture(text: string, source: ReminderSource): Promise<{ uploaded: boolean }> {
    const reminder = createReminder({
      id: randomUUID(),
      userId: this.userId,
      text,
      source,
      now: new Date(),
    });
    await this.engine.save(reminder);
    const uploaded = await this.engine.flush();
    return { uploaded };
  }
}
