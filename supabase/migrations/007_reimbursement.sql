-- Reimbursement paid alongside service and product commission.
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.commissions
  add column if not exists reimbursement numeric(12, 2) not null default 0 check (reimbursement >= 0);
