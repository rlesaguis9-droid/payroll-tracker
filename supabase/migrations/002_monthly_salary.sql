-- Monthly salary, paid semi-monthly (every 15th and 30th).
-- Run once in Supabase → SQL Editor. Safe to re-run.

alter table public.employees
  add column if not exists monthly_salary numeric(12, 2) not null default 0 check (monthly_salary >= 0);

-- Pay types are now 'monthly' and 'hourly' (old 'salary' = per-period amount → monthly = ×2).
alter table public.employees drop constraint if exists employees_pay_type_check;
update public.employees set pay_type = 'monthly', monthly_salary = pay_rate * 2 where pay_type = 'salary';
alter table public.employees alter column pay_type set default 'monthly';
alter table public.employees add constraint employees_pay_type_check check (pay_type in ('monthly', 'hourly'));
