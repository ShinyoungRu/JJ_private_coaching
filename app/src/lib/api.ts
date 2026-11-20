// Thin wrappers that turn Supabase / Edge Function errors into one error type
// with a parent-friendly message and a machine-readable code.
import type { PostgrestError } from "@supabase/supabase-js";
import { FUNCTIONS_URL, supabase } from "./supabase";

export class ApiError extends Error {
  constructor(message: string, public code = "server_error") {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  "42501": "You don't have permission to do that.",
  "23505": "That already exists.",
};

export function toApiError(error: PostgrestError | { message: string; hint?: string | null; code?: string }): ApiError {
  const code = error.hint || error.code || "server_error";
  const msg = (error.code && FRIENDLY[error.code] && !error.hint) ? FRIENDLY[error.code] : error.message;
  return new ApiError(msg || "Something went wrong.", code);
}

/** Throws on error, returns data otherwise. */
export function unwrap<D>(res: { data: D; error: PostgrestError | null }): NonNullable<D> {
  if (res.error) throw toApiError(res.error);
  return res.data as NonNullable<D>;
}

/** Calls an Edge Function with the logged-in user's token. */
export async function invoke<D = unknown>(name: string, body: Record<string, unknown>): Promise<D> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = "server_error";
    let message = "Something went wrong. Please try again.";
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const j = await ctx.clone().json();
        code = j?.error?.code ?? code;
        message = j?.error?.message ?? message;
      } catch { /* not json */ }
    }
    throw new ApiError(message, code);
  }
  return data as D;
}

/** Public (no-login) Edge Function GET. */
export async function publicGet<D>(path: string): Promise<D> {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`);
  if (!res.ok) throw new ApiError("Could not load data.", `http_${res.status}`);
  return res.json() as Promise<D>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
