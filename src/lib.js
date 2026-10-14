import { createClient } from '@supabase/supabase-js'

const url = __SUPABASE_URL__
const key = __SUPABASE_ANON_KEY__

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null

export const OVERTIME_MULTIPLIER = 1.5

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
export const money = (n) => currency.format(Number(n) || 0)

export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Hourly: hours × rate + overtime × rate × 1.5.
// Monthly: half the monthly salary per cutoff (paid every 15th and 30th).
export function calcGross(employee, hours, overtime) {
  if (!employee) return 0
  if (employee.pay_type === 'monthly') return round2((Number(employee.monthly_salary) || 0) / 2)
  const rate = Number(employee.pay_rate) || 0
  return round2((Number(hours) || 0) * rate + (Number(overtime) || 0) * rate * OVERTIME_MULTIPLIER)
}

export const payLabel = (e) =>
  e.pay_type === 'monthly' ? `${money(e.monthly_salary)} /month` : `${money(e.pay_rate)} /hr`

// Semi-monthly cutoffs for a month ("2026-10"):
//   1st cutoff: 1–15, paid on the 15th
//   2nd cutoff: 16–end of month, paid on the 30th (or the last day in February)
const pad = (n) => String(n).padStart(2, '0')
export function cutoffs(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const d = (day) => `${y}-${pad(m)}-${pad(day)}`
  return [
    { id: 1, label: '1st cutoff', period_start: d(1), period_end: d(15), pay_date: d(15) },
    { id: 2, label: '2nd cutoff', period_start: d(16), period_end: d(last), pay_date: d(Math.min(30, last)) },
  ]
}
export const thisMonth = () => today().slice(0, 7)

// The cutoff a pay date belongs to: day 1–15 → 1st cutoff, 16+ → 2nd cutoff of that month.
export const cutoffForDate = (date) => cutoffs(date.slice(0, 7))[isSecondCutoff(date) ? 1 : 0]

// The next upcoming cutoff on or after today.
export function nextCutoff() {
  const t = today()
  const found = cutoffs(thisMonth()).find((c) => c.pay_date >= t)
  if (found) return { month: thisMonth(), ...found }
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1)
  const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  return { month: next, ...cutoffs(next)[0] }
}

export const round2 = (n) => Math.round(n * 100) / 100

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// Theme: 'system' follows the device; 'light' / 'dark' override it. Saved per browser.
// index.html applies the saved choice before the page renders to avoid a flash.
const THEME_KEY = 'theme'
export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'system' } catch { return 'system' }
}
export function setTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

// EGOV (government) monthly deductions stored on each employee.
export const EGOV_FIELDS = ['sss_contribution', 'sss_loan', 'pagibig_contribution', 'pagibig_loan', 'philhealth_contribution']
export const egovMonthly = (e) => round2(EGOV_FIELDS.reduce((t, k) => t + (Number(e?.[k]) || 0), 0))
// EGOV is split between the two cutoffs: half on the 15th, the rest on the 30th.
// (The 30th takes any odd centavo, so the two halves always add up to the monthly total.)
// A period or pay date on the 16th or later counts as the 2nd cutoff.
export const isSecondCutoff = (periodStart) => Number(String(periodStart).slice(8, 10)) >= 16
export function egovForPeriod(e, periodStart) {
  if (!periodStart) return 0
  const monthly = egovMonthly(e)
  const first = Math.floor(monthly * 50) / 100 // half, rounded down to the centavo
  return isSecondCutoff(periodStart) ? round2(monthly - first) : first
}

// Text size: scales every font in the app. Saved per browser; index.html applies it before render.
export const TEXT_SIZES = [
  { id: 'small', label: 'Small', scale: 0.9 },
  { id: 'default', label: 'Default', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.15 },
  { id: 'xlarge', label: 'Extra large', scale: 1.3 },
]
const TEXT_KEY = 'textSize'
export function getTextSize() {
  try { return localStorage.getItem(TEXT_KEY) || 'default' } catch { return 'default' }
}
export function setTextSize(id) {
  const size = TEXT_SIZES.find((t) => t.id === id) || TEXT_SIZES[1]
  try { localStorage.setItem(TEXT_KEY, size.id) } catch {}
  document.documentElement.style.setProperty('--text-scale', size.scale)
}
