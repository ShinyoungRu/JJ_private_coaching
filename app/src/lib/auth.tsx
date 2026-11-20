import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { AppSettings, Profile } from "./types";
import { DEFAULT_TZ } from "./format";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  settings: AppSettings | null;
  /** Coach's time zone (from app_settings), used for every displayed time. */
  tz: string;
  isCoach: boolean;
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

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadFor(data.session);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
      // Defer DB calls out of the auth callback (supabase-js recommendation).
      setTimeout(() => {
        loadFor(s).finally(() => setLoading(false));
      }, 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadFor]);

  const value: AuthState = {
    session,
    profile,
    settings,
    tz: settings?.timezone ?? DEFAULT_TZ,
    isCoach: profile?.role === "coach",
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
