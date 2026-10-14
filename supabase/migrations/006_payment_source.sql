-- Where each payment came from (a bank from Settings → Banks, or cash).
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.payroll_entries
  add column if not exists bank_id   uuid references public.banks (id) on delete set null,
  add column if not exists paid_from text;   -- label kept as written, e.g. "BDO •••• 1234" or "Cash"

alter table public.commissions
  add column if not exists bank_id   uuid references public.banks (id) on delete set null,
  add column if not exists paid_from text;
