-- =============================================================================
-- JJ Private Training app - 11: training location
--
-- Where sessions happen. Shown on the booking pages, confirmation/reminder
-- emails and the "Add to calendar" file, with a Google Maps directions link.
-- The coach can edit both fields in Settings; leave the name blank to hide it.
-- =============================================================================

alter table public.app_settings
  add column training_location_name    text not null default 'Cherry Street Park'
    check (char_length(training_location_name) <= 120),
  add column training_location_address text not null default 'Upper Providence Township, Media, PA 19063'
    check (char_length(training_location_address) <= 200);

comment on column public.app_settings.training_location_name is
  'Where sessions are held (e.g. Cherry Street Park). Blank hides the location everywhere.';
comment on column public.app_settings.training_location_address is
  'Street address / town for the location, used for the directions link.';
