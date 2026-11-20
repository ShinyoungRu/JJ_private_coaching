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
      <nav className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Coach">
        <div className="flex w-max gap-1 rounded-xl border border-line bg-panel-2 p-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx("whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
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
