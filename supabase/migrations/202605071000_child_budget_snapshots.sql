-- Volledige app-state per kind (sync tussen browsers/toestellen met dezelfde kind-link).
-- Run dit script één keer in de Supabase SQL Editor als je database nog geen tabel heeft.
--
-- Beveiliging: policies hieronder laten toe dat elke client met de anon key een snapshot
-- kan lezen/schrijven op basis van child_id. Houd je deel-links voor jezelf (UUID niet publiek).

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
