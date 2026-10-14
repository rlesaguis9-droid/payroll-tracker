-- EGOV: monthly government contributions and loans per employee.
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.employees
  add column if not exists sss_contribution        numeric(12, 2) not null default 0 check (sss_contribution >= 0),
  add column if not exists sss_loan                numeric(12, 2) not null default 0 check (sss_loan >= 0),
  add column if not exists pagibig_contribution    numeric(12, 2) not null default 0 check (pagibig_contribution >= 0),
  add column if not exists pagibig_loan            numeric(12, 2) not null default 0 check (pagibig_loan >= 0),
  add column if not exists philhealth_contribution numeric(12, 2) not null default 0 check (philhealth_contribution >= 0);
