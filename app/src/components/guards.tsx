import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { Loading } from "./ui";

/** Sends logged-out users to /login?next=<current path>. UI-only: the database enforces access regardless. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RequireCoach({ children }: { children: ReactNode }) {
  const { session, isCoach, loading, profile } = useAuth();
  if (loading || (session && !profile)) return <Loading />;
  if (!session) return <Navigate to="/login?next=%2Fadmin" replace />;
  if (!isCoach) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** "/" -> coach dashboard, parent bookings, or login. */
export function HomeRedirect() {
  const { session, isCoach, loading, profile } = useAuth();
  if (loading || (session && !profile)) return <Loading />;
  if (!session) return <Navigate to="/book" replace />;
  return <Navigate to={isCoach ? "/admin" : "/bookings"} replace />;
}
