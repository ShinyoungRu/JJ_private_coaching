# Backend Build Prompt: JJ Private Training App

Paste everything below the line into Hostinger Horizons, Cursor, Claude Code, or another AI coding tool. Fill in the [brackets] first.

---

Build the backend for a booking and player-progress web app for a private soccer coach, using Supabase (Postgres, Auth, Storage, Edge Functions) and Stripe.

## Existing website (context)
- The coach already has a live marketing website at https://www.jjprivatetraining.com ("JJ Private Training, Co. - Elite Soccer Training"), built with Hostinger Horizons. The domain is managed in Hostinger.
- The website is frontend only: info, photos, and a contact page. It has no logins and no database.
- IMPORTANT: This app is a SEPARATE project. Do not modify, rebuild, or redeploy the existing website. The only planned change to it is adding links or buttons that point to this app, which I will add myself.
- Match the existing site's branding: dark theme (primary color #1a1a1a), the same logo, and a similar font style, so moving from the site to the app feels seamless.

## Integration with the existing website
- The app will be hosted at the subdomain https://app.jjprivatetraining.com. Give me the exact DNS record (type, name, value) to add in Hostinger.
- Configure Supabase Auth so the Site URL and redirect URLs (signup confirmation, magic link, password reset) all use https://app.jjprivatetraining.com.
- Stripe Checkout success and cancel URLs must return to https://app.jjprivatetraining.com.
- Support deep links so the main site can link straight to specific pages:
  - /book (booking calendar, optionally with a ?type= query parameter to preselect a session type)
  - /login
  - /packages
- Public read-only endpoint (Edge Function, no login needed) that the main website can call later, with CORS allowing only https://www.jjprivatetraining.com and https://jjprivatetraining.com:
  - GET next available session slots (date and time only, no customer data)
  - GET active session types and packages with prices
- Contact form endpoint (Edge Function) that the existing website's contact form can POST to later:
  - Saves to an "inquiries" table (name, email, phone, message, created_at, status) and emails the coach.
  - Add basic spam protection (rate limiting by IP, plus a honeypot field).
  - Same CORS rules as above.
- Make the booking page embeddable in an iframe on the main site later (allow framing only from jjprivatetraining.com).

## Users and roles
- Two roles: "coach" (one admin account) and "parent".
- Parents sign up with email and password, or a magic link. Parents own the accounts; children do NOT get logins.
- A parent can have multiple players (children) on their account.
- Collect minimal child data: first name, age group, skill level, optional notes. No child email, phone, or photos.

## Database tables
- profiles: id (links to auth user), role, full_name, phone, created_at
- players: id, parent_id, first_name, age_group, skill_level, notes
- session_types: id, name (e.g. 1-on-1, small group), duration_minutes, price, max_players, active
- availability: the coach's weekly recurring hours (day_of_week, start_time, end_time)
- blocked_times: specific dates and times the coach is unavailable
- bookings: id, session_type_id, player_id, parent_id, start_time, end_time, status (booked, cancelled, completed, no_show), paid_with (stripe or package), created_at
- packages: id, name (e.g. 5 sessions, 10 sessions), session_count, price, active
- package_purchases: id, parent_id, package_id, sessions_remaining, stripe_payment_id, purchased_at, expires_at
- session_notes: id, booking_id, player_id, skills_worked_on, coach_notes, homework, created_at
- drills: id, title, description, video_url (Supabase Storage), skill_tag
- player_drills: player_id, drill_id, assigned_at
- inquiries: id, name, email, phone, message, status (new, replied, closed), created_at

## Security (Row Level Security on every table)
- Parents can only read and write their own profile, their own players, and their own bookings and purchases.
- Parents can read session notes and assigned drills for their own players only. They cannot edit them.
- The coach can read and write everything, including inquiries.
- Anyone logged in can read active session_types, packages, and open time slots.
- The public endpoints must never expose names, emails, players, or booking details.
- Inquiries can only be inserted through the contact Edge Function, never read publicly.

## Booking logic
- Generate available slots from availability, minus blocked_times, minus existing bookings.
- Prevent double-booking with a database constraint or transaction, not only a frontend check.
- Group sessions: allow up to max_players per slot.
- Cancellation policy: parents can cancel or reschedule up to [24] hours before. Inside that window, the session is forfeited and package credit is not returned.
- If a booking is paid with a package, subtract 1 from sessions_remaining. Refund the credit if it is cancelled within policy.
- All times are stored in UTC and shown in the coach's time zone.

## Payments (Stripe)
- Use Stripe Checkout for single sessions and for package purchases.
- Use a Stripe webhook Edge Function to confirm payment before marking a booking as paid or adding package credits. Never trust the frontend for payment status.
- Use Stripe TEST mode until I say otherwise. Keep all keys in environment variables, never in code.
- Payments go to the coach's Stripe account.

## Notifications
- Email confirmation when a booking is made or cancelled.
- Reminder email [24] hours before each session, sent by a scheduled function.
- Coach can send an announcement email to all parents (e.g. "field closed today").
- Coach gets an email for each new website inquiry.
- Use [Resend] for email, sent from an address on jjprivatetraining.com. Give me the DNS records needed to verify the sending domain in Hostinger.

## Coach admin features (backend endpoints and queries)
- Today's and this week's schedule, with payment status.
- Add, edit, or block availability.
- Write a session note after a booking (quick form: skills, notes, homework).
- Upload drill videos and assign them to players.
- View and update website inquiries.
- Basic stats: sessions this month, revenue, active players, new inquiries.

## Deliverables
1. SQL migration files for all tables, constraints, indexes, and RLS policies
2. Edge Functions: stripe-checkout, stripe-webhook, send-reminders, send-announcement, public-availability, public-pricing, contact-form
3. Seed data for testing (1 coach, 2 parents, 3 players, sample session types and packages)
4. A short README: environment variables, running it locally, deploying, and connecting the app.jjprivatetraining.com subdomain
5. An "Integration checklist" for the existing website: the exact buttons and links to add (with URLs), and a ready-to-paste HTML/JS snippet for later connecting the contact form and showing the "next available session" on the main site
6. A list of manual tests to confirm security (e.g. parent A cannot see parent B's players, and the public endpoints leak no personal data)

Business details:
- Session types and prices: [e.g. 1-on-1 60 min $___, small group 60 min $___]
- Packages: [e.g. 5 sessions $___, 10 sessions $___]
- Coach's time zone: [America/New_York]
- Coach's email for notifications: [___]
