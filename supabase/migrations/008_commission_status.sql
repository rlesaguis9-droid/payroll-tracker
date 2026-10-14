-- Commissions get a status like payroll entries. New commissions are saved as paid.
-- Run once in Supabase → SQL Editor. Safe to re-run. Existing commissions become 'paid'.
alter table public.commissions
  add column if not exists status text not null default 'paid' check (status in ('pending', 'paid'));
