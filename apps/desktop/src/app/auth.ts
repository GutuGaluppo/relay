import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { KeyValueStorage } from "@relay/sync";
import { supabaseConfig } from "./config";

export function createSupabase(storage: KeyValueStorage): SupabaseClient {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) throw new Error("Supabase is not configured");
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "relay-auth",
    },
  });
}

/**
 * Email one-time code: the simplest production-safe option that needs no
 * deep-link handling. The email template must include {{ .Token }}.
 */
export async function sendEmailCode(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<Session> {
  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("No session returned");
  return data.session;
}
