import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { firstName } from "../lib/format";
import { type Theme, useTheme } from "../lib/theme";
import { buttonClasses, cx } from "./ui";

// Same assets as www.jjprivatetraining.com: dark-text logo for light backgrounds,
// light logo for dark ones (dark theme header, footer).
const CDN = "https://horizons-cdn.hostinger.com/15d30f89-ee6f-40af-a967-2464869fd5b6";
const LOGO_URL = `${CDN}/1828ebd3f37ad2a004fb662b0f7ee3d2.png`;
const LOGO_LIGHT_URL = `${CDN}/4f227aae71add9c639ba8f483f5edf44.png`;
const HERO_IMAGE_URL = `${CDN}/49b3187a71e371f1560467fcacfd1f26.jpg`;
const COACHUP_LOGO_URL = `${CDN}/b6eb880a5f70ba52772dcdf7d971eaed.png`;
const SITE_URL = "https://www.jjprivatetraining.com";
const CONTACT_EMAIL = "jjprivatetraining@gmail.com";
const CONTACT_PHONE = { display: "(484) 274-4788", tel: "+14842744788" };

/** Logo + name. `onDark` = sits on a dark background (dark theme header, footer). */
function Brand({ onDark, lazy }: { onDark: boolean; lazy?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3">
      <img
        src={onDark ? LOGO_LIGHT_URL : LOGO_URL}
        alt="JJ Private Training logo"
        loading={lazy ? "lazy" : undefined}
        className={cx("h-14 w-auto object-contain transition-transform group-hover:scale-105", onDark && "brightness-110")}
      />
      <div className="flex flex-col justify-center">
        <div className={cx("text-base font-bold leading-none tracking-tight", onDark ? "text-white" : "text-fg")}>Private Training, Co.</div>
        <div className={cx("mt-1 text-sm font-bold leading-none", onDark ? "text-blue-400" : "text-brand")}>Elite Soccer Training</div>
      </div>
    </Link>
  );
}

/** Full-bleed photo banner, like the hero on www.jjprivatetraining.com. */
export function PageHero({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    // Breaks out of <main>'s max-width to span the viewport; the root's overflow-x-clip
    // absorbs the scrollbar width so this never causes horizontal scroll.
    <section className="relative mx-[calc(50%-50vw)] -mt-8 mb-10 overflow-hidden sm:-mt-10 sm:mb-12">
      <div className="absolute inset-0">
        <img src={HERO_IMAGE_URL} alt="" fetchPriority="high" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 to-black/40" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="animate-rise-in max-w-3xl">
          <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">{title}</h1>
          {subtitle && <p className="mt-5 text-lg leading-relaxed text-gray-200 md:text-xl">{subtitle}</p>}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button onClick={onToggle} aria-label={label} title={label}
      className="rounded-lg p-2 text-fg-2 transition-colors hover:bg-panel-2 hover:text-brand">
      {theme === "dark" ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}

const SITE_LINKS = [
  { href: `${SITE_URL}/`, label: "Home" },
  { href: `${SITE_URL}/about`, label: "About Trainer" },
  { href: `${SITE_URL}/packages`, label: "Training Packages" },
  { href: `${SITE_URL}/reviews`, label: "Client Reviews" },
  { href: `${SITE_URL}/faq`, label: "FAQ" },
  { href: `${SITE_URL}/contact`, label: "Contact" },
];

function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-900 pb-8 pt-16 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="space-y-6">
            <Brand onDark lazy />
            <p className="leading-relaxed text-gray-400">
              High-performance soccer training focused on unlocking your full potential on the field.
            </p>
          </div>
          <div className="md:pl-8">
            <span className="mb-6 block text-lg font-bold text-white">Quick Links</span>
            <ul className="space-y-3">
              {SITE_LINKS.map((l) => (
                <li key={l.href}><a href={l.href} className="text-gray-400 transition-colors hover:text-blue-400">{l.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <span className="mb-6 block text-lg font-bold text-white">Contact</span>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-gray-400">
                <span className="rounded-lg bg-gray-800 p-2 text-blue-500">
                  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
                  </svg>
                </span>
                <a href={`mailto:${CONTACT_EMAIL}`} className="break-all transition-colors hover:text-blue-400">{CONTACT_EMAIL}</a>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <span className="rounded-lg bg-gray-800 p-2 text-blue-500">
                  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </svg>
                </span>
                <a href={`tel:${CONTACT_PHONE.tel}`} className="transition-colors hover:text-blue-400">{CONTACT_PHONE.display}</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 text-center text-sm text-gray-500 md:flex-row md:text-left">
          <p>&copy; {new Date().getFullYear()} JJ Private Training, Co. All Rights Reserved.</p>
          <div className="flex items-center gap-3">
            <span>Trusted by</span>
            <img src={COACHUP_LOGO_URL} alt="CoachUp" loading="lazy" className="h-5 w-auto object-contain brightness-110" />
          </div>
        </div>
      </div>
    </footer>
  );
}

/** One-line footer for logged-in app pages (the full website footer is for visitors). */
function CompactFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-sm text-subtle sm:flex-row sm:px-6 sm:text-left lg:px-8">
        <p>&copy; {new Date().getFullYear()} JJ Private Training, Co.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-brand">{CONTACT_EMAIL}</a>
          <a href={`tel:${CONTACT_PHONE.tel}`} className="transition-colors hover:text-brand">{CONTACT_PHONE.display}</a>
          <a href={SITE_URL} className="transition-colors hover:text-brand">Website</a>
        </div>
      </div>
    </footer>
  );
}

const LOG_OUT_CLASS = "rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft";

export function Layout() {
  const { session, profile, isCoach, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const links = session
    ? isCoach
      ? [
        { to: "/admin", label: "Dashboard" },
        { to: "/book", label: "Client booking page" },
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

  // Same nav treatment as the website: blue + bold when active, gray with a soft hover otherwise.
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      "rounded-lg px-3 py-2 text-sm transition-all duration-300",
      isActive ? "font-bold text-brand" : "font-medium text-fg-2 hover:bg-panel-2 hover:text-brand",
    );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line bg-panel/95 shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand onDark={theme === "dark"} />
          <div className="hidden items-center gap-2 lg:flex">
            <nav className="flex items-center gap-2" aria-label="Main">
              {links.map((l) => <NavLink key={l.to} to={l.to} className={navClass} end={false}>{l.label}</NavLink>)}
            </nav>
            <div className="ml-4 flex items-center gap-2 border-l border-line pl-4">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {session ? (
                <>
                  <NavLink to="/account" className={navClass}>
                    <span className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                      </svg>
                      <span className="max-w-[150px] truncate">{firstName(profile?.full_name) || "Account"}</span>
                    </span>
                  </NavLink>
                  <button onClick={signOut} className={LOG_OUT_CLASS}>Log out</button>
                </>
              ) : (
                <Link to="/login" className={buttonClasses("primary", "sm")}>Login / Sign Up</Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              className="rounded-lg p-2 text-fg-2 transition-colors hover:bg-panel-2 hover:text-brand"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {open ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line bg-panel px-4 pb-4 pt-2 lg:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {links.map((l) => <NavLink key={l.to} to={l.to} className={navClass} end={false}>{l.label}</NavLink>)}
              {session ? (
                <>
                  <NavLink to="/account" className={navClass}>Account</NavLink>
                  <button onClick={signOut} className={cx(LOG_OUT_CLASS, "text-left")}>Log out</button>
                </>
              ) : (
                <Link to="/login" className={buttonClasses("primary", "md", "mt-1")}>Login / Sign Up</Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Outlet />
      </main>

      {session ? <CompactFooter /> : <Footer />}
    </div>
  );
}
