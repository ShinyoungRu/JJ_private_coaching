import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy app/.env.example to app/.env.local.");
}

// Only the public anon/publishable key belongs here. Never the service role key.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const FUNCTIONS_URL = `${url}/functions/v1`;
