import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { firstName } from "../lib/format";
import { cx } from "./ui";

export const LOGO_URL = "https://horizons-cdn.hostinger.com/15d30f89-ee6f-40af-a967-2464869fd5b6/4f227aae71add9c639ba8f483f5edf44.png";
export const SITE_URL = "https://www.jjprivatetraining.com";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3">
      <img src={LOGO_URL} alt="JJ Private Training logo" className="h-11 w-auto object-contain brightness-110 transition-transform group-hover:scale-105" />
      <div className="flex flex-col justify-center">
        <div className="text-base font-bold leading-none tracking-tight text-white">Private Training, Co.</div>
        <div className="mt-1 text-sm font-bold leading-none text-brand-soft">Elite Soccer Training</div>
      </div>
    </Link>
  );
}

export function Layout() {
  const { session, profile, isCoach, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const links = session
    ? isCoach
      ? [
        { to: "/admin", label: "Dashboard" },
        { to: "/book", label: "Calendar" },
      ]
      : [
        { to: "/book", label: "Book" },
        { to: "/bookings", label: "My Bookings" },
        { to: "/players", label: "Players" },
        { to: "/packages", label: "Packages" },
      ]
    : [
      { to: "/book", label: "Book" },
      { to: "/packages", label: "Packages" },
    ];

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
      isActive ? "bg-white/10 text-white" : "text-gray-300 hover:bg-white/5 hover:text-white",
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={navClass} end={false}>{l.label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <>
                <NavLink to="/account" className={navClass}>{firstName(profile?.full_name) || "Account"}</NavLink>
                <button onClick={signOut} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-400 hover:text-white">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">Log in</Link>
            )}
          </div>
          <button
            className="rounded-lg p-2 text-gray-300 hover:bg-white/5 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {open ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {open && (
          <nav className="border-t border-line px-4 pb-4 pt-2 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {links.map((l) => <NavLink key={l.to} to={l.to} className={navClass} end={false}>{l.label}</NavLink>)}
              {session ? (
                <>
                  <NavLink to="/account" className={navClass}>Account</NavLink>
                  <button onClick={signOut} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-400 hover:text-white">Sign out</button>
                </>
              ) : (
                <Link to="/login" className="mt-1 rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white">Log in</Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} JJ Private Training, Co.</p>
          <div className="flex gap-4">
            <a href={SITE_URL} className="hover:text-gray-300">jjprivatetraining.com</a>
            <a href="mailto:jjprivatetraining@gmail.com" className="hover:text-gray-300">jjprivatetraining@gmail.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
