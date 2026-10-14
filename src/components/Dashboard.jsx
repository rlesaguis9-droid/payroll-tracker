import { useEffect, useState } from 'react'
import { supabase, money, fmtDate } from '../lib.js'

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const year = new Date().getFullYear()
    const monthStart = new Date().toISOString().slice(0, 8) + '01'

    Promise.all([
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('payroll_entries').select('gross, net, status, pay_date').gte('pay_date', `${year}-01-01`),
      supabase
        .from('payroll_entries')
        .select('id, pay_date, gross, net, status, employees(full_name)')
        .order('pay_date', { ascending: false })
        .limit(8),
    ]).then(([emp, ytd, rec]) => {
      const err = emp.error || ytd.error || rec.error
      if (err) return setError(err.message)
      const rows = ytd.data
      const sum = (list, k) => list.reduce((s, r) => s + Number(r[k]), 0)
      const month = rows.filter((r) => r.pay_date >= monthStart)
      const pending = rows.filter((r) => r.status === 'pending')
      setStats({
        activeEmployees: emp.count ?? 0,
        monthGross: sum(month, 'gross'),
        ytdNetPaid: sum(rows.filter((r) => r.status === 'paid'), 'net'),
        pendingCount: pending.length,
        pendingNet: sum(pending, 'net'),
      })
      setRecent(rec.data)
    })
  }, [])

  if (error) return <div className="alert error">{error}</div>
  if (!stats) return <div className="muted">Loading…</div>

  return (
    <>
      <div className="page-head">
        <h2>Dashboard</h2>
        <button className="btn primary" onClick={() => onNavigate('payroll')}>+ New pay entry</button>
      </div>

      <div className="stats">
        <Stat label="Active employees" value={stats.activeEmployees} />
        <Stat label="Gross this month" value={money(stats.monthGross)} />
        <Stat label="Net paid (YTD)" value={money(stats.ytdNetPaid)} />
        <Stat label="Pending" value={money(stats.pendingNet)} sub={`${stats.pendingCount} entr${stats.pendingCount === 1 ? 'y' : 'ies'}`} />
      </div>

      <div className="card">
        <h3>Recent pay entries</h3>
        {recent.length === 0 ? (
          <p className="muted">No pay entries yet. Add employees, then record your first payroll.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Pay date</th><th className="num">Gross</th><th className="num">Net</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.employees?.full_name}</td>
                    <td>{fmtDate(r.pay_date)}</td>
                    <td className="num">{money(r.gross)}</td>
                    <td className="num">{money(r.net)}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  )
}
