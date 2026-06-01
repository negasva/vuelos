-- FlightTracker Co
-- Supabase schema for users, tracked flights, and price history.
-- Designed to be compatible with future alerting and cron-based tracking.

create extension if not exists pgcrypto;

-- Users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tracked flights table
create table if not exists public.tracked_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  origin text not null,
  destination text not null,
  baggage_type text not null default 'any' check (baggage_type in ('any', 'morral', 'mano_10kg', 'bodega_23kg')),
  max_stops integer not null default 0 check (max_stops >= 0),
  visa_exclusion boolean not null default false,
  night_only boolean not null default false,
  flex_days integer not null default 0 check (flex_days between 0 and 3),
  target_price numeric(12,2) not null check (target_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracked_flights_user_id_idx on public.tracked_flights(user_id);
create index if not exists tracked_flights_route_active_idx on public.tracked_flights(origin, destination, is_active);

-- Price history table
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.tracked_flights(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  airline text,
  departure_time timestamptz,
  checked_at timestamptz not null default now()
);

create index if not exists price_history_flight_id_idx on public.price_history(flight_id);
create index if not exists price_history_checked_at_idx on public.price_history(checked_at desc);

-- Cron and backend error logs
create table if not exists public.flight_tracking_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists flight_tracking_logs_created_at_idx on public.flight_tracking_logs(created_at desc);

-- Keep updated_at in sync on write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_tracked_flights_updated_at on public.tracked_flights;
create trigger set_tracked_flights_updated_at
before update on public.tracked_flights
for each row execute function public.set_updated_at();

-- Optional RLS starter policies.
alter table public.users enable row level security;
alter table public.tracked_flights enable row level security;
alter table public.price_history enable row level security;

-- These are starter policies; tighten them once auth is wired up.
drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
on public.users
for select
using (auth.uid() = id);

drop policy if exists "Users can manage their tracked flights" on public.tracked_flights;
create policy "Users can manage their tracked flights"
on public.tracked_flights
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read flight price history" on public.price_history;
create policy "Users can read flight price history"
on public.price_history
for select
using (
  exists (
    select 1
    from public.tracked_flights tf
    where tf.id = price_history.flight_id
      and tf.user_id = auth.uid()
  )
);
