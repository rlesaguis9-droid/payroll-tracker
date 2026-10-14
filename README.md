# Payroll Tracker

A clean, minimal payroll tracker built with **React + Vite** and **Supabase** (Postgres + Auth).
Code on **GitHub**, hosted free on **Vercel**.

## Features
- Email/password sign-in (Supabase Auth). Each user only sees their own data (Row Level Security).
- **Employees** — name, email, position, hourly or salaried, pay rate, active/inactive.
- **Payroll** — pay entries per employee with pay period, pay date, regular + overtime hours (1.5×),
  auto-calculated gross, deductions, net, pending/paid status, notes. Filters, totals and CSV export.
- **Dashboard** — active employees, gross this month, net paid YTD, pending payouts, recent entries.
- Light/dark mode, mobile friendly.

## 1. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. Go to **Authentication → URL Configuration** and add your site URL(s) to *Redirect URLs*:
   - `http://localhost:5173`
   - `https://<your-project>.vercel.app`

> The anon key is safe to expose in a browser app — Row Level Security in `schema.sql` is what protects your data.
> Never put the `service_role` key in this app.

## 2. Run locally
```bash
cp .env.example .env.local   # then fill in your URL and anon key
npm install
npm run dev
```
Open http://localhost:5173 and sign up.

## 3. Deploy (GitHub + Vercel)
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
Then on [vercel.com/new](https://vercel.com/new):
1. **Import** the GitHub repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
2. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (or connect Vercel's Supabase integration, which adds `SUPABASE_URL` / `SUPABASE_ANON_KEY`; both work).
3. Click **Deploy**. Every push to `main` redeploys automatically; other branches get preview URLs.
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel URL
   and add it (plus `http://localhost:5173`) to **Redirect URLs**.

## Project structure
```
supabase/schema.sql          Database tables + RLS policies
src/lib.js                   Supabase client, formatting, gross-pay calculation, CSV export
src/App.jsx                  Auth gate + tab navigation
src/components/Auth.jsx      Sign in / sign up
src/components/Dashboard.jsx Summary stats
src/components/Employees.jsx Employee CRUD
src/components/Payroll.jsx   Pay entries CRUD, filters, totals, CSV
src/styles.css               All styling (CSS variables at the top)
```

## Customizing
- **Overtime multiplier:** `OVERTIME_MULTIPLIER` in `src/lib.js`.
- **Currency:** the `currency` formatter in `src/lib.js`.
- **Gross pay rules:** `calcGross()` in `src/lib.js`.
- **Colors:** CSS variables at the top of `src/styles.css`.
- **New fields:** add a column in Supabase, then add an input to the form in the relevant component.

> This app tracks payroll; it does not calculate taxes or move money. Enter deductions from your payroll
> provider or accountant.
