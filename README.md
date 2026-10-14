# Payroll Tracker

A clean, minimal payroll tracker built with **React + Vite** and **Supabase** (Postgres + Auth).
Deploys for free to **GitHub Pages**.

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
   - `https://<your-github-username>.github.io/<repo-name>/`

> The anon key is safe to expose in a browser app — Row Level Security in `schema.sql` is what protects your data.
> Never put the `service_role` key in this app.

## 2. Run locally
```bash
cp .env.example .env.local   # then fill in your URL and anon key
npm install
npm run dev
```
Open http://localhost:5173 and sign up.

## 3. Deploy to GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
Then on GitHub:
1. **Settings → Secrets and variables → Actions → New repository secret** — add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
3. Push to `main` (or re-run the workflow under **Actions**). Your app will be live at
   `https://<your-username>.github.io/<repo-name>/`.

Prefer Vercel or Netlify? Import the repo, set the same two env vars, build command `npm run build`, output `dist`.

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
.github/workflows/deploy.yml GitHub Pages build + deploy
```

## Customizing
- **Overtime multiplier:** `OVERTIME_MULTIPLIER` in `src/lib.js`.
- **Currency:** the `currency` formatter in `src/lib.js`.
- **Gross pay rules:** `calcGross()` in `src/lib.js`.
- **Colors:** CSS variables at the top of `src/styles.css`.
- **New fields:** add a column in Supabase, then add an input to the form in the relevant component.

> This app tracks payroll; it does not calculate taxes or move money. Enter deductions from your payroll
> provider or accountant.
