-- PLANILHA NEXORA — SUPABASE SCHEMA V1
-- A V1 local não depende deste schema. Ele é a base para sincronização futura.

create extension if not exists "pgcrypto";

create table if not exists public.nexora_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Conta principal',
  broker text not null default 'IC Markets',
  account_type text not null default 'Raw Spread',
  currency text not null default 'USD',
  initial_balance numeric(18,2) not null default 400,
  current_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nexora_assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.nexora_accounts(id) on delete cascade,
  symbol text not null,
  name text,
  price_unit numeric(18,8) not null,
  nexora_points_per_price_unit numeric(18,8) not null,
  contract_size numeric(18,8) not null,
  min_lot numeric(18,8) not null default 0.01,
  lot_step numeric(18,8) not null default 0.01,
  commission_per_lot_round_turn numeric(18,8) not null default 0,
  avg_spread numeric(18,8) not null default 0,
  created_at timestamptz not null default now(),
  unique(account_id, symbol)
);

create table if not exists public.nexora_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.nexora_accounts(id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  asset_symbol text not null,
  profile text not null,
  strategy text,
  target_points numeric(18,4),
  stop_points numeric(18,4),
  context text,
  journal text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.nexora_operations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.nexora_accounts(id) on delete cascade,
  session_id uuid references public.nexora_sessions(id) on delete set null,
  operation_date date not null,
  operation_time time,
  asset_symbol text not null,
  direction smallint not null check (direction in (-1,1)),
  lot numeric(18,8) not null,
  entry_price numeric(24,10),
  exit_price numeric(24,10),
  nexora_points numeric(24,8) not null,
  gross_result numeric(18,8) not null default 0,
  mt5_net_result numeric(18,8) not null,
  mt5_commission numeric(18,8) not null default 0,
  implicit_execution_cost numeric(18,8) not null default 0,
  strategy text,
  note text,
  input_mode text not null default 'detailed',
  created_at timestamptz not null default now()
);

create table if not exists public.nexora_capital_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.nexora_accounts(id) on delete cascade,
  movement_type text not null check (movement_type in ('deposit','withdraw')),
  amount numeric(18,8) not null check (amount >= 0),
  movement_date date not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.nexora_accounts enable row level security;
alter table public.nexora_assets enable row level security;
alter table public.nexora_sessions enable row level security;
alter table public.nexora_operations enable row level security;
alter table public.nexora_capital_movements enable row level security;

-- Policies: each authenticated user sees only rows belonging to their account.
create policy "account owner access" on public.nexora_accounts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "asset owner access" on public.nexora_assets
for all using (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
);

create policy "session owner access" on public.nexora_sessions
for all using (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
);

create policy "operation owner access" on public.nexora_operations
for all using (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
);

create policy "capital owner access" on public.nexora_capital_movements
for all using (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.nexora_accounts a where a.id = account_id and a.user_id = auth.uid())
);
