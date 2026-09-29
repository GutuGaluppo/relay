import "expo-sqlite/localStorage/install";
import type { KeyValueStorage } from "@relay/sync";

/** SQLite-backed localStorage (expo-sqlite): durable across app kills and restarts. */
export const storage: KeyValueStorage = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};
