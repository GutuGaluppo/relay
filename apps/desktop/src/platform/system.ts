/**
 * System integrations. Every function degrades gracefully when the UI runs in a
 * plain browser (vite dev without Tauri), which keeps the UI easy to iterate on.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as autostart from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export const inTauri = isTauri();

export type WindowMode = "overlay" | "compact" | "normal";
export type NavigateRoute = "home" | "pending" | "settings";

export async function setWindowMode(mode: WindowMode, focus: boolean): Promise<void> {
  if (!inTauri) return;
  await invoke("set_window_mode", { mode, focus });
}

export async function hideWindow(): Promise<void> {
  if (!inTauri) return;
  await invoke("hide_main_window");
}

export async function showWindow(): Promise<void> {
  if (!inTauri) return;
  await invoke("show_main_window");
}

export async function launchedAtLogin(): Promise<boolean> {
  if (!inTauri) return false;
  return invoke<boolean>("launched_at_login");
}

export async function setTrayPending(pending: boolean): Promise<void> {
  if (!inTauri) return;
  await invoke("set_tray_pending", { pending });
}

export async function notify(title: string, body: string): Promise<void> {
  if (!inTauri) return;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}

export async function getLaunchAtLogin(): Promise<boolean> {
  if (!inTauri) return false;
  return autostart.isEnabled();
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!inTauri) return;
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

type SystemHandlers = {
  onUnlock(): void;
  onResume(): void;
  onNavigate(route: NavigateRoute): void;
  onWindowHidden(): void;
};

/** Subscribe to OS lifecycle events forwarded by the Rust side. */
export async function listenSystemEvents(handlers: SystemHandlers): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];
  const onOnline = () => handlers.onResume();
  window.addEventListener("online", onOnline);
  if (inTauri) {
    unlisteners.push(
      await listen("relay://unlocked", () => handlers.onUnlock()),
      await listen("relay://resumed", () => handlers.onResume()),
      await listen<NavigateRoute>("relay://navigate", (e) => handlers.onNavigate(e.payload)),
      await listen("relay://window-hidden", () => handlers.onWindowHidden()),
    );
  }
  return () => {
    window.removeEventListener("online", onOnline);
    unlisteners.forEach((u) => u());
  };
}
