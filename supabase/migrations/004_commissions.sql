-- Commissions: one row per employee per date, with service and product commission.
-- Run once in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.commissions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  employee_id         uuid not null references public.employees (id) on delete cascade,
  date                date not null default current_date,
  service_commission  numeric(12, 2) not null default 0 check (service_commission >= 0),
  product_commission  numeric(12, 2) not null default 0 check (product_commission >= 0),
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists commissions_user_date_idx on public.commissions (user_id, date desc);
create index if not exists commissions_employee_idx on public.commissions (employee_id);

alter table public.commissions enable row level security;

drop policy if exists "own commissions" on public.commissions;
create policy "own commissions" on public.commissions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
