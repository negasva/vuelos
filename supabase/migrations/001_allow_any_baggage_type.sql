-- Migration: allow "any" baggage_type for flexible searches.
-- Run this in Supabase SQL editor or your migration flow.

alter table public.tracked_flights
  drop constraint if exists tracked_flights_baggage_type_check;

alter table public.tracked_flights
  add constraint tracked_flights_baggage_type_check
  check (baggage_type in ('any', 'morral', 'mano_10kg', 'bodega_23kg'));

alter table public.tracked_flights
  alter column baggage_type set default 'any';

