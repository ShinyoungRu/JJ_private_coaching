import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, RouterProvider } from "react-router";
import { HomeRedirect, RequireAuth, RequireCoach } from "./components/guards";
import { Layout } from "./components/Layout";
import { buttonClasses, Loading, ToastProvider } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import Account from "./pages/Account";
import Book from "./pages/Book";
import BookingSuccess from "./pages/BookingSuccess";
import EmbedBook from "./pages/EmbedBook";
import Login from "./pages/Login";
import MyBookings from "./pages/MyBookings";
import Packages from "./pages/Packages";
import Players from "./pages/Players";
import ResetPassword from "./pages/ResetPassword";
import AdminLayout from "./pages/admin/AdminLayout";

// Coach screens load on demand, so parents download less.
const Announcements = lazy(() => import("./pages/admin/Announcements"));
const Availability = lazy(() => import("./pages/admin/Availability"));
const Catalog = lazy(() => import("./pages/admin/Catalog"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Drills = lazy(() => import("./pages/admin/Drills"));
const Families = lazy(() => import("./pages/admin/Families"));
const Inquiries = lazy(() => import("./pages/admin/Inquiries"));
const Settings = lazy(() => import("./pages/admin/Settings"));

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-gray-400">That page doesn't exist.</p>
      <Link to="/book" className={buttonClasses("primary", "md", "mt-6")}>Book a session</Link>
    </div>
  );
}

// Routes used by the marketing site, Stripe and emails: /book(?type=), /login, /packages,
// /booking/success, /bookings, /reset-password, /admin, /admin/inquiries, /embed/book. Keep them stable.
const router = createBrowserRouter([
  { path: "/embed/book", element: <EmbedBook /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "login", element: <Login /> },
      { path: "reset-password", element: <ResetPassword /> },
      { path: "book", element: <Book /> },
      { path: "packages", element: <Packages /> },
      { path: "booking/success", element: <RequireAuth><BookingSuccess /></RequireAuth> },
      { path: "bookings", element: <RequireAuth><MyBookings /></RequireAuth> },
      { path: "players", element: <RequireAuth><Players /></RequireAuth> },
      { path: "account", element: <RequireAuth><Account /></RequireAuth> },
      {
        path: "admin",
        element: <RequireCoach><Suspense fallback={<Loading />}><AdminLayout /></Suspense></RequireCoach>,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "availability", element: <Availability /> },
          { path: "families", element: <Families /> },
          { path: "drills", element: <Drills /> },
          { path: "inquiries", element: <Inquiries /> },
          { path: "announcements", element: <Announcements /> },
          { path: "catalog", element: <Catalog /> },
          { path: "settings", element: <Settings /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}
