-- =============================================================================
-- JJ Private Training app - 09: who may call which database function
--
-- Postgres lets EVERYONE execute new functions by default, and Supabase
-- exposes every public-schema function at /rest/v1/rpc/<name>. So we revoke
-- everything and then grant back only what browsers should call.
--
-- Anything that writes bookings, credits or payments is service_role only:
-- Edge Functions call it after verifying the user (and Stripe).
-- =============================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

-- New functions created later are private by default too.
-- (If you add a function the browser should call, GRANT it explicitly.)
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---- Logged-in users (parents and coach) ----------------------------------
grant execute on function public.is_coach()                                  to authenticated;  -- used by RLS
grant execute on function public.coach_timezone()                            to authenticated;
grant execute on function public.get_available_slots(uuid, date, date, integer) to authenticated;
grant execute on function public.public_next_slots(integer, uuid)            to authenticated;

-- ---- Coach dashboard (each also checks is_coach() internally) -------------
grant execute on function public.admin_schedule(date, date, boolean)                                   to authenticated;
grant execute on function public.admin_stats()                                                         to authenticated;
grant execute on function public.admin_complete_session(uuid, text[], text, text, public.booking_status) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, public.booking_status, public.payment_status) to authenticated;
grant execute on function public.admin_block_time(timestamptz, timestamptz, date, date, text)          to authenticated;

-- Everything else (book_with_package, create_pending_booking,
-- confirm_stripe_booking, grant_package_purchase, cancel_booking,
-- reschedule_booking, admin_create_booking, record_stripe_refund,
-- claim_due_reminders, unclaim_reminders, announcement_recipients,
-- check_rate_limit, release_expired_holds, invoke_scheduled_function,
-- internal _helpers and trigger functions) is service_role only.
