-- Banks: bank accounts managed in Settings → Banks.
-- Run once in Supabase → SQL Editor. Safe to re-run.
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
