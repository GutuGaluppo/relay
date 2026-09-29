import { HOUR_MS, MINUTE_MS, type ReminderRules } from "@relay/domain";
import type { KeyValueStorage } from "@relay/sync";

export type Settings = {
  launchAtLogin: boolean;
  notificationsEnabled: boolean;
  /** "Agora não" delay. */
  initialDelayMinutes: number;
  /** "Ainda não" delay. */
  notYetMinutes: number;
  showTimer: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  launchAtLogin: true,
  notificationsEnabled: true,
  initialDelayMinutes: 2 * (HOUR_MS / MINUTE_MS),
  notYetMinutes: 90,
  showTimer: true,
};

const KEY = "settings.v1";

export async function loadSettings(storage: KeyValueStorage): Promise<Settings> {
  try {
    const raw = await storage.getItem(KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(storage: KeyValueStorage, settings: Settings): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(settings));
}

export function rulesFromSettings(s: Settings): ReminderRules {
  return {
    initialDismissMs: s.initialDelayMinutes * MINUTE_MS,
    notYetMs: s.notYetMinutes * MINUTE_MS,
    tomorrowHour: 9,
  };
}
