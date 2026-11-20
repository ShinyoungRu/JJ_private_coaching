import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { AppSettings, Profile } from "./types";
import { DEFAULT_TZ } from "./format";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  settings: AppSettings | null;
  /** Coach's time zone (from app_settings), used for every displayed time. */
  tz: string;
  /** Jonathan: the app's one coach / admin account. */
  isCoach: boolean;
  /** Client who signed up as an adult athlete (books for themselves). */
  isAdultClient: boolean;
  loading: boolean;
  /** True right after the user clicked a password-reset link. */
  recovering: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  const loadFor = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setSettings(null);
      return;
    }
    const [p, st] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setProfile(p.data ?? null);
    setSettings(st.data ?? null);
  }, []);

  // User id whose profile/settings are loaded (undefined = nothing loaded yet).
  const loadedFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION right after subscribing, so no separate
    // getSession() call is needed. TOKEN_REFRESHED (hourly, and when a tab wakes up)
    // keeps the same user, so profile/settings are only refetched when the user changes
    // or their account was updated.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
      const userId = s?.user.id ?? null;
      if (userId === loadedFor.current && event !== "USER_UPDATED") return;
      loadedFor.current = userId;
      // Defer DB calls out of the auth callback (supabase-js recommendation).
      setTimeout(() => {
        loadFor(s).finally(() => setLoading(false));
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadFor]);

  const value: AuthState = {
    session,
    profile,
    settings,
    tz: settings?.timezone ?? DEFAULT_TZ,
    isCoach: profile?.role === "coach",
    isAdultClient: profile?.role === "client" && profile.client_type === "adult",
    loading,
    recovering,
    refresh: () => loadFor(session),
    signOut: async () => {
      await supabase.auth.signOut();
      setRecovering(false);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
