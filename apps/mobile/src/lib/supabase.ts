import "expo-sqlite/localStorage/install";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const LOCAL_USER_ID = "00000000-0000-4000-8000-00000000cafe";

/** Null when the app runs without a backend (local mode). */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export async function sendEmailCode(email: string): Promise<void> {
  if (!supabase) throw new Error("Sincronização não configurada");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  if (!supabase) throw new Error("Sincronização não configurada");
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}
