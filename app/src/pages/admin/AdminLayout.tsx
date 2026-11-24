import { Suspense } from "react";
import { NavLink, Outlet } from "react-router";
import { cx, Loading } from "../../components/ui";

const TABS = [
  { to: "/admin", label: "Schedule", end: true },
  { to: "/admin/availability", label: "Availability" },
  { to: "/admin/families", label: "Clients" },
  { to: "/admin/drills", label: "Drills" },
  { to: "/admin/inquiries", label: "Inquiries" },
  { to: "/admin/announcements", label: "Announce" },
  { to: "/admin/catalog", label: "Prices" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminLayout() {
  return (
    <div>
      <nav className="mb-8" aria-label="Coach">
        {/* 4 x 2 grid on phones so every tab stays visible; one row from sm up. */}
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-panel-2 p-1 sm:flex sm:w-max">

          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx("whitespace-nowrap rounded-lg px-1 py-2 text-center text-sm font-semibold transition-colors sm:px-3.5",
                  isActive ? "bg-panel text-brand shadow-sm" : "text-muted hover:text-fg")}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
