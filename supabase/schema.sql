-- Payroll Tracker schema
-- Run this once in Supabase → SQL Editor → New query.
-- Every row belongs to the signed-in user; Row Level Security keeps data private.

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  position    text,
  pay_type    text not null default 'monthly' check (pay_type in ('monthly', 'hourly')),
  monthly_salary numeric(12, 2) not null default 0 check (monthly_salary >= 0), -- paid half on the 15th, half on the 30th
  pay_rate    numeric(12, 2) not null default 0 check (pay_rate >= 0), -- hourly rate
  -- EGOV monthly amounts
  sss_contribution        numeric(12, 2) not null default 0 check (sss_contribution >= 0),
  sss_loan                numeric(12, 2) not null default 0 check (sss_loan >= 0),
  pagibig_contribution    numeric(12, 2) not null default 0 check (pagibig_contribution >= 0),
  pagibig_loan            numeric(12, 2) not null default 0 check (pagibig_loan >= 0),
  philhealth_contribution numeric(12, 2) not null default 0 check (philhealth_contribution >= 0),
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

-- Commissions
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

-- Banks
create table if not exists public.banks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_name       text not null,
  account_name    text,
  account_number  text,
  branch          text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists banks_user_idx on public.banks (user_id);

alter table public.banks enable row level security;

drop policy if exists "own banks" on public.banks;
create policy "own banks" on public.banks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Payment source
alter table public.payroll_entries
  add column if not exists bank_id   uuid references public.banks (id) on delete set null,
  add column if not exists paid_from text;   -- label kept as written, e.g. "BDO •••• 1234" or "Cash"

alter table public.commissions
  add column if not exists bank_id   uuid references public.banks (id) on delete set null,
  add column if not exists paid_from text;

-- Reimbursement
alter table public.commissions
  add column if not exists reimbursement numeric(12, 2) not null default 0 check (reimbursement >= 0);

-- Commission status
alter table public.commissions
  add column if not exists status text not null default 'paid' check (status in ('pending', 'paid'));
