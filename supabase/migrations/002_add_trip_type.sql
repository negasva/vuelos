-- Migration: add round-trip support to tracked flights.
-- Run this in the Supabase SQL editor (or your migration flow) BEFORE deploying
-- the round-trip UI/API, otherwise inserts will fail on the new columns.

alter table public.tracked_flights
  add column if not exists trip_type text not null default 'one_way'
  check (trip_type in ('one_way', 'round_trip'));

alter table public.tracked_flights
  add column if not exists trip_length_days integer not null default 7
  check (trip_length_days between 1 and 60);
