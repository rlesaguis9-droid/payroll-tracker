import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, downloadCsv } from '../lib.js'

const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'commission', label: 'Commissions' },
]

// Every saved payroll entry and commission in one list, newest first. Read-only.
export default function RecordBook() {
  const [records, setRecords] = useState(null)
  const [kind, setKind] = useState('all')
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('payroll_entries').select('*, employees(full_name)'),
      supabase.from('commissions').select('*, employees(full_name)'),
    ]).then(([pay, com]) => {
      const err = pay.error || com.error
      if (err) return setError(err.message)
      const payroll = pay.data.map((r) => ({
        id: `p-${r.id}`,
        kind: 'payroll',
        date: r.pay_date,
        created_at: r.created_at,
        employee: r.employees?.full_name,
        details: `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)} · Gross ${money(r.gross)} · Deductions ${money(r.deductions)}${r.paid_from ? ` · Paid from ${r.paid_from}` : ''}`,
        amount: Number(r.net),
        status: r.status,
        notes: r.notes,
      }))
      const commissions = com.data.map((r) => ({
        id: `c-${r.id}`,
        kind: 'commission',
        date: r.date,
        created_at: r.created_at,
        employee: r.employees?.full_name,
        details: `Service ${money(r.service_commission)} · Product ${money(r.product_commission)}${r.paid_from ? ` · Paid from ${r.paid_from}` : ''}`,
        amount: Number(r.service_commission) + Number(r.product_commission),
        status: null,
        notes: r.notes,
      }))
      setRecords(
        [...payroll, ...commissions].sort((a, b) =>
          b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
      )
    })
  }, [])

  const visible = useMemo(
    () => (records || []).filter((r) => kind === 'all' || r.kind === kind),
    [records, kind]
  )
  const total = visible.reduce((t, r) => t + r.amount, 0)

  function exportCsv() {
    downloadCsv(`record-book-${today()}.csv`, visible.map((r) => ({
      date: r.date,
      type: r.kind === 'payroll' ? 'Payroll' : 'Commission',
      employee: r.employee,
      details: r.details,
      amount: r.amount.toFixed(2),
      status: r.status ?? '',
      notes: r.notes ?? '',
    })))
  }

  return (
    <>
      <div className="page-head">
        <h2>Record Book</h2>
        <div className="row">
          <div className="segmented" role="tablist" aria-label="Record type">
            {KINDS.map((k) => (
              <button key={k.id} role="tab" aria-selected={kind === k.id}
                className={kind === k.id ? 'segment active' : 'segment'} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={exportCsv} disabled={!visible.length}>Export CSV</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {!records ? (
          <p className="muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="muted">No saved entries yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Employee</th><th>Details</th><th className="num">Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date" className="nowrap">{fmtDate(r.date)}</td>
                    <td data-label="Type"><span className={`badge kind-${r.kind}`}>{r.kind === 'payroll' ? 'Payroll' : 'Commission'}</span></td>
                    <td className="cell-title"><strong>{r.employee}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                    <td data-label="Details" className="muted small">{r.details}</td>
                    <td data-label={r.kind === 'payroll' ? 'Net pay' : 'Commission'} className="num"><strong>{money(r.amount)}</strong></td>
                    <td data-label="Status">{r.status ? <span className={`badge ${r.status}`}>{r.status}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="cell-title">Total ({visible.length})</td>
                  <td data-label="Total" className="num">{money(total)}</td>
                  <td className="hide-sm"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
