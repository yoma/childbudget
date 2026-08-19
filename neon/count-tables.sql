-- Run on Supabase (service role / SQL Editor) and later on Neon.
-- Compare both result sets before switching the app.

select 'families'::text as tabel, count(*)::bigint as rijen from public.families
union all select 'children', count(*) from public.children
union all select 'profiles', count(*) from public.profiles
union all select 'monthly_budgets', count(*) from public.monthly_budgets
union all select 'transactions', count(*) from public.transactions
union all select 'coach_settings', count(*) from public.coach_settings
union all select 'child_budget_snapshots', count(*) from public.child_budget_snapshots
order by 1;
