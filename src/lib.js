import { createClient } from '@supabase/supabase-js'

const url = __SUPABASE_URL__
const key = __SUPABASE_ANON_KEY__

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null

export const OVERTIME_MULTIPLIER = 1.5

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
export const money = (n) => currency.format(Number(n) || 0)

export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export const today = () => new Date().toISOString().slice(0, 10)

// Hourly: hours × rate + overtime × rate × 1.5. Salary: pay_rate is the amount per pay period.
export function calcGross(employee, hours, overtime) {
  if (!employee) return 0
  const rate = Number(employee.pay_rate) || 0
  if (employee.pay_type === 'salary') return round2(rate)
  return round2((Number(hours) || 0) * rate + (Number(overtime) || 0) * rate * OVERTIME_MULTIPLIER)
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
