-- Payroll Tracker schema
-- Run this once in Supabase → SQL Editor → New query.
-- Every row belongs to the signed-in user; Row Level Security keeps data private.

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  position    text,
  pay_type    text not null default 'hourly' check (pay_type in ('hourly', 'salary')),
  pay_rate    numeric(12, 2) not null default 0 check (pay_rate >= 0), -- hourly rate, or salary per pay period
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.payroll_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  pay_date        date not null,
  hours           numeric(8, 2) not null default 0,
  overtime_hours  numeric(8, 2) not null default 0,
  gross           numeric(12, 2) not null default 0,
  deductions      numeric(12, 2) not null default 0,
  net             numeric(12, 2) generated always as (gross - deductions) stored,
  status          text not null default 'pending' check (status in ('pending', 'paid')),
  notes           text,
  created_at      timestamptz not null default now(),
  constraint period_order check (period_end >= period_start)
);

create index if not exists employees_user_idx on public.employees (user_id);
create index if not exists payroll_user_paydate_idx on public.payroll_entries (user_id, pay_date desc);
create index if not exists payroll_employee_idx on public.payroll_entries (employee_id);

alter table public.employees enable row level security;
alter table public.payroll_entries enable row level security;

drop policy if exists "own employees" on public.employees;
create policy "own employees" on public.employees
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own payroll entries" on public.payroll_entries;
create policy "own payroll entries" on public.payroll_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
