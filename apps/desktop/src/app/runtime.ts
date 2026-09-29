import type { SupabaseClient } from "@supabase/supabase-js";
import {
  StorageReminderRemote,
  SupabaseReminderRemote,
  SyncEngine,
  type KeyValueStorage,
} from "@relay/sync";
import {
  hideWindow,
  listenSystemEvents,
  notify,
  setLaunchAtLogin,
  setTrayPending,
  setWindowMode,
} from "../platform/system";
import { ReminderController } from "./controller";
import { loadSettings, saveSettings, type Settings } from "./settings";

export type Account =
  | { mode: "cloud"; userId: string; email: string | null; client: SupabaseClient }
  | { mode: "local"; userId: string };

export type Runtime = {
  account: Account;
  engine: SyncEngine;
  controller: ReminderController;
  saveSettings(settings: Settings): Promise<void>;
  dispose(): void;
  signOut(): Promise<void>;
};

export async function startRuntime(
  account: Account,
  storage: { data: KeyValueStorage; settings: KeyValueStorage },
): Promise<Runtime> {
  const remote =
    account.mode === "cloud"
      ? new SupabaseReminderRemote(account.client)
      : new StorageReminderRemote(storage.data);

  const engine = new SyncEngine({
    userId: account.userId,
    remote,
    storage: storage.data,
    reconcileIntervalMs: 60_000,
  });

  const settings = await loadSettings(storage.settings);
  const controller = new ReminderController(
    engine,
    { setWindowMode, hideWindow, notify, setTrayPending },
    settings,
  );

  const unlistenPromise = listenSystemEvents({
    onUnlock: controller.onUnlock,
    onResume: controller.onResume,
    onNavigate: (route) => void controller.navigate(route),
    onWindowHidden: () => void controller.onWindowHidden(),
  });
  await controller.start();

  const dispose = () => {
    controller.stop();
    engine.stop();
    void unlistenPromise.then((u) => u());
  };

  return {
    account,
    engine,
    controller,
    dispose,
    async saveSettings(next) {
      const prev = controller.getState().settings;
      if (prev.launchAtLogin !== next.launchAtLogin) await setLaunchAtLogin(next.launchAtLogin);
      await saveSettings(storage.settings, next);
      controller.updateSettings(next);
    },
    async signOut() {
      dispose();
      await engine.reset();
      if (account.mode === "cloud") await account.client.auth.signOut();
    },
  };
}
