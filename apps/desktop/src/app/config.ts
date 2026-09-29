export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

/** Without Supabase credentials the app runs in local mode (no cloud sync). */
export const hasCloud = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

/** Fixed identity used in local mode. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-00000000cafe";
