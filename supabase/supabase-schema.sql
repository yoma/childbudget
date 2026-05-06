-- Lena Money / Family Budget schema (multi-kid ready)
-- Run this whole script in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- 1) Families and children
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  slug text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (family_id, slug)
);

-- 2) User profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  role text not null check (role in ('mama', 'papa', 'lena', 'admin')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- 3) Monthly budgets (per child, month, category, parent)
create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  month text not null,
  category text not null check (category in ('zakgeld', 'kleding')),
  parent text not null check (parent in ('mama', 'papa')),
  amount numeric(12,2) not null,
  auto_renew boolean not null default false,
  recurring_start_month text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_monthly_budgets_unique
  on public.monthly_budgets(child_id, month, category, parent);

-- 4) Transactions (human + system transfers)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null,
  month text not null,
  category text not null check (category in ('zakgeld', 'kleding')),
  amount numeric(12,2) not null,
  note text,
  created_by_parent text check (created_by_parent in ('mama', 'papa')),
  system_transfer boolean not null default false,
  linked_group_id uuid,
  budget_usage jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_child_month
  on public.transactions(child_id, month);

-- 5) Coach settings (per child, shared by parents)
create table if not exists public.coach_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade unique,
  auto_coach_enabled boolean not null default true,
  sensitivity text not null default 'normal' check (sensitivity in ('calm', 'normal', 'strict')),
  mama_message text not null default '',
  mama_message_expires_at timestamptz,
  papa_message text not null default '',
  papa_message_expires_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_monthly_budgets_touch on public.monthly_budgets;
create trigger trg_monthly_budgets_touch
before update on public.monthly_budgets
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_coach_settings_touch on public.coach_settings;
create trigger trg_coach_settings_touch
before update on public.coach_settings
for each row execute procedure public.touch_updated_at();

-- 6) Full app snapshot per kind (localStorage-sync tussen devices via anon API)
create table if not exists public.child_budget_snapshots (
  child_id uuid primary key references public.children(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_child_budget_snapshots_family
  on public.child_budget_snapshots(family_id);

alter table public.child_budget_snapshots enable row level security;

drop policy if exists child_budget_snapshots_anon_all on public.child_budget_snapshots;
create policy child_budget_snapshots_anon_all on public.child_budget_snapshots
for all
using (true)
with check (true);

grant select, insert, update, delete on public.child_budget_snapshots to anon, authenticated;

-- -------------------------
-- Row Level Security (RLS)
-- -------------------------

alter table public.families enable row level security;
alter table public.children enable row level security;
alter table public.profiles enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.coach_settings enable row level security;

-- Helper: resolve current profile quickly
create or replace view public.current_profile
with (security_invoker = true) as
select p.*
from public.profiles p
where p.id = auth.uid();

-- families
drop policy if exists families_select on public.families;
create policy families_select on public.families
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = families.id
  )
);

drop policy if exists families_insert_authenticated on public.families;
create policy families_insert_authenticated on public.families
for insert
with check (auth.uid() is not null);

drop policy if exists families_write_admin on public.families;
create policy families_write_admin on public.families
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = families.id
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = families.id
      and p.role = 'admin'
  )
);

drop policy if exists families_delete_admin on public.families;
create policy families_delete_admin on public.families
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = families.id
      and p.role = 'admin'
  )
);

-- children
drop policy if exists children_select on public.children;
create policy children_select on public.children
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = children.family_id
  )
);

drop policy if exists children_write_admin on public.children;
create policy children_write_admin on public.children
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = children.family_id
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.family_id = children.family_id
      and p.role = 'admin'
  )
);

-- profiles
drop policy if exists profiles_select_family on public.profiles;
create policy profiles_select_family on public.profiles
for select
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.family_id = profiles.family_id
  )
);

drop policy if exists profiles_write_self on public.profiles;
create policy profiles_write_self on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_insert_seed_admin on public.profiles;
create policy profiles_insert_seed_admin on public.profiles
for insert
with check (
  id = auth.uid()
  and role = 'admin'
);

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
for insert
with check (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.family_id = profiles.family_id
      and me.role = 'admin'
  )
);

-- monthly_budgets: lena read-only, parents+admin write
drop policy if exists monthly_budgets_select on public.monthly_budgets;
create policy monthly_budgets_select on public.monthly_budgets
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_id = monthly_budgets.family_id
  )
);

drop policy if exists monthly_budgets_write on public.monthly_budgets;
create policy monthly_budgets_write on public.monthly_budgets
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = monthly_budgets.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = monthly_budgets.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
);

-- transactions: lena read-only, parents+admin write
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_id = transactions.family_id
  )
);

drop policy if exists transactions_write on public.transactions;
create policy transactions_write on public.transactions
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = transactions.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = transactions.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
);

-- coach settings: lena read-only, parents+admin write
drop policy if exists coach_settings_select on public.coach_settings;
create policy coach_settings_select on public.coach_settings
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_id = coach_settings.family_id
  )
);

drop policy if exists coach_settings_write on public.coach_settings;
create policy coach_settings_write on public.coach_settings
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = coach_settings.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_id = coach_settings.family_id
      and p.role in ('mama', 'papa', 'admin')
  )
);
