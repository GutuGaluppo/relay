/**
 * Owns the signed-in runtime: starts it once per account and tears it down on
 * sign-out. Kept outside React so effects re-running never double-start sync.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStorage } from "../platform/storage";
import { showWindow } from "../platform/system";
import { createSupabase } from "./auth";
import { hasCloud, LOCAL_USER_ID } from "./config";
import { startRuntime, type Account, type Runtime } from "./runtime";

export type SessionState =
  | { phase: "loading" }
  | { phase: "signin" }
  | { phase: "ready"; runtime: Runtime }
  | { phase: "error"; message: string };

const LOCAL_MODE_KEY = "account.local";

const storage = {
  data: createStorage("data"),
  auth: createStorage("auth"),
  settings: createStorage("settings"),
};

export const supabase: SupabaseClient | null = hasCloud ? createSupabase(storage.auth) : null;

let state: SessionState = { phase: "loading" };
const listeners = new Set<() => void>();
let current: { userId: string; runtime: Promise<Runtime> } | null = null;
let booted = false;

function set(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

export const session = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  boot,
  useLocalMode: async () => {
    await storage.settings.setItem(LOCAL_MODE_KEY, "1");
    await activate({ mode: "local", userId: LOCAL_USER_ID });
  },
};

async function activate(account: Account): Promise<void> {
  if (current?.userId === account.userId) return;
  await deactivate();
  const runtime = startRuntime(account, storage);
  current = { userId: account.userId, runtime };
  try {
    set({ phase: "ready", runtime: await runtime });
  } catch (err) {
    current = null;
    set({ phase: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function deactivate(): Promise<void> {
  if (!current) return;
  const { runtime } = current;
  current = null;
  (await runtime).dispose();
}

async function showSignIn(): Promise<void> {
  await deactivate();
  set({ phase: "signin" });
  await showWindow();
}

async function boot(): Promise<void> {
  if (booted) return;
  booted = true;

  if (!supabase) {
    if (await storage.settings.getItem(LOCAL_MODE_KEY)) {
      await activate({ mode: "local", userId: LOCAL_USER_ID });
    } else {
      await showSignIn();
    }
    return;
  }

  supabase.auth.onAuthStateChange((event, s) => {
    // Defer: Supabase recommends not awaiting other calls inside this callback.
    setTimeout(() => {
      if (s?.user) {
        void activate({
          mode: "cloud",
          userId: s.user.id,
          email: s.user.email ?? null,
          client: supabase,
        });
      } else if (event === "SIGNED_OUT") {
        void showSignIn();
      }
    }, 0);
  });

  const { data } = await supabase.auth.getSession();
  if (!data.session) await showSignIn();
}
