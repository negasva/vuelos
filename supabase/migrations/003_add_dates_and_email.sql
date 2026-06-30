-- Migration: exact travel dates + email notifications.
-- Run this in the Supabase SQL editor BEFORE deploying the matching UI/API.

-- Exact (optional) departure / return dates for each tracked flight.
-- When null, the cron falls back to a rolling departure (~30 days out) and,
-- for round trips, departure + trip_length_days.
alter table public.tracked_flights
  add column if not exists depart_date date;

alter table public.tracked_flights
  add column if not exists return_date date;

-- Where to email this user's alerts (Telegram chat id already exists).
alter table public.users
  add column if not exists notify_email text;
