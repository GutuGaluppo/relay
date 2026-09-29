import { load, type Store } from "@tauri-apps/plugin-store";
import type { KeyValueStorage } from "@relay/sync";
import { inTauri } from "./system";

/** Durable key/value storage in the app data directory (Tauri store plugin). */
class TauriStorage implements KeyValueStorage {
  private store: Promise<Store>;

  constructor(file: string) {
    this.store = load(file, { autoSave: false, defaults: {} });
  }

  async getItem(key: string): Promise<string | null> {
    const value = await (await this.store).get<string>(key);
    return value ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const store = await this.store;
    await store.set(key, value);
    await store.save(); // flush to disk immediately: reminders must survive a crash
  }

  async removeItem(key: string): Promise<void> {
    const store = await this.store;
    await store.delete(key);
    await store.save();
  }
}

class BrowserStorage implements KeyValueStorage {
  constructor(private readonly prefix: string) {}
  async getItem(key: string) {
    return localStorage.getItem(this.prefix + key);
  }
  async setItem(key: string, value: string) {
    localStorage.setItem(this.prefix + key, value);
  }
  async removeItem(key: string) {
    localStorage.removeItem(this.prefix + key);
  }
}

export function createStorage(name: "data" | "auth" | "settings"): KeyValueStorage {
  return inTauri ? new TauriStorage(`${name}.json`) : new BrowserStorage(`relay.${name}.`);
}
