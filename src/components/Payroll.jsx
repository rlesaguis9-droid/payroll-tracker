import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, calcGross, round2, downloadCsv } from '../lib.js'

const EMPTY = {
  employee_id: '', period_start: '', period_end: '', pay_date: today(),
  hours: '', overtime_hours: '', gross: '', deductions: '', status: 'pending', notes: '',
}

export default function Payroll() {
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(null)
  const [grossEdited, setGrossEdited] = useState(false)
  const [filter, setFilter] = useState({ status: '', employee_id: '', from: '', to: '' })
  const [error, setError] = useState(null)

  async function load() {
    let q = supabase
      .from('payroll_entries')
      .select('*, employees(full_name, pay_type)')
      .order('pay_date', { ascending: false })
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.employee_id) q = q.eq('employee_id', filter.employee_id)
    if (filter.from) q = q.gte('pay_date', filter.from)
    if (filter.to) q = q.lte('pay_date', filter.to)
    const { data, error } = await q
    if (error) setError(error.message)
    else setRows(data)
  }

  useEffect(() => {
    supabase.from('employees').select('*').order('full_name').then(({ data, error }) => {
      if (error) setError(error.message)
      else setEmployees(data)
    })
  }, [])
  useEffect(() => { load() }, [filter])

  const employee = employees.find((e) => e.id === form?.employee_id)

  // Auto-calculate gross until the user types their own value.
  useEffect(() => {
    if (form && !grossEdited) setForm((f) => ({ ...f, gross: calcGross(employee, f.hours, f.overtime_hours) || '' }))
  }, [form?.employee_id, form?.hours, form?.overtime_hours, grossEdited])

  function openNew() {
    setGrossEdited(false)
    setForm({ ...EMPTY })
  }
  function openEdit(r) {
    const { employees: _, net, created_at, user_id, ...fields } = r
    setGrossEdited(true)
    setForm({ ...fields, notes: fields.notes ?? '' })
  }

  async function save(e) {
    e.preventDefault()
    const { id, ...f } = form
    const payload = {
      ...f,
      hours: Number(f.hours) || 0,
      overtime_hours: Number(f.overtime_hours) || 0,
      gross: round2(Number(f.gross) || 0),
      deductions: round2(Number(f.deductions) || 0),
    }
    const { error } = id
      ? await supabase.from('payroll_entries').update(payload).eq('id', id)
      : await supabase.from('payroll_entries').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function toggleStatus(r) {
    const status = r.status === 'paid' ? 'pending' : 'paid'
    const { error } = await supabase.from('payroll_entries').update({ status }).eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  async function remove(r) {
    if (!confirm('Delete this pay entry?')) return
    const { error } = await supabase.from('payroll_entries').delete().eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  function exportCsv() {
    downloadCsv(`payroll-${today()}.csv`, rows.map((r) => ({
      employee: r.employees?.full_name,
      period_start: r.period_start,
      period_end: r.period_end,
      pay_date: r.pay_date,
      hours: r.hours,
      overtime_hours: r.overtime_hours,
      gross: r.gross,
      deductions: r.deductions,
      net: r.net,
      status: r.status,
      notes: r.notes,
    })))
  }

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ gross: t.gross + Number(r.gross), deductions: t.deductions + Number(r.deductions), net: t.net + Number(r.net) }),
    { gross: 0, deductions: 0, net: 0 }
  ), [rows])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })
  const net = round2((Number(form?.gross) || 0) - (Number(form?.deductions) || 0))

  return (
    <>
      <div className="page-head">
        <h2>Payroll</h2>
        <div className="row">
          <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          <button className="btn primary" onClick={openNew} disabled={!employees.length}>+ New pay entry</button>
        </div>
      </div>

      {!employees.length && <div className="alert">Add an employee first on the Employees tab.</div>}
      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {form && (
        <form className="card form-grid" onSubmit={save}>
          <h3 className="span-all">{form.id ? 'Edit pay entry' : 'New pay entry'}</h3>
          <label className="span-2">
            Employee
            <select required value={form.employee_id} onChange={set('employee_id')}>
              <option value="">Select…</option>
              {employees.filter((e) => e.active || e.id === form.employee_id).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} — {money(e.pay_rate)}{e.pay_type === 'hourly' ? '/hr' : '/period'}
                </option>
              ))}
            </select>
          </label>
          <label>Status
            <select value={form.status} onChange={set('status')}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label>Period start<input type="date" required value={form.period_start} onChange={set('period_start')} /></label>
          <label>Period end<input type="date" required min={form.period_start} value={form.period_end} onChange={set('period_end')} /></label>
          <label>Pay date<input type="date" required value={form.pay_date} onChange={set('pay_date')} /></label>
          {employee?.pay_type !== 'salary' && (
            <>
              <label>Regular hours<input type="number" min="0" step="0.25" value={form.hours} onChange={set('hours')} /></label>
              <label>Overtime hours (1.5×)<input type="number" min="0" step="0.25" value={form.overtime_hours} onChange={set('overtime_hours')} /></label>
            </>
          )}
          <label>
            Gross pay {grossEdited && <button type="button" className="link inline" onClick={() => setGrossEdited(false)}>recalculate</button>}
            <input type="number" min="0" step="0.01" required value={form.gross}
              onChange={(e) => { setGrossEdited(true); set('gross')(e) }} />
          </label>
          <label>Deductions (tax, benefits…)<input type="number" min="0" step="0.01" value={form.deductions} onChange={set('deductions')} /></label>
          <div className="net-preview"><span className="muted small">Net pay</span><strong>{money(net)}</strong></div>
          <label className="span-all">Notes<input value={form.notes} onChange={set('notes')} /></label>
          <div className="span-all row end">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary">Save</button>
          </div>
        </form>
      )}

      <div className="card filters">
        <label>Employee
          <select value={filter.employee_id} onChange={setF('employee_id')}>
            <option value="">All</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={filter.status} onChange={setF('status')}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label>Pay date from<input type="date" value={filter.from} onChange={setF('from')} /></label>
        <label>to<input type="date" value={filter.to} onChange={setF('to')} /></label>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">No pay entries match.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th><th>Period</th><th>Pay date</th><th className="num">Hours</th>
                  <th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.employees?.full_name}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                    <td className="nowrap">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</td>
                    <td className="nowrap">{fmtDate(r.pay_date)}</td>
                    <td className="num">
                      {r.employees?.pay_type === 'salary' ? '—' : Number(r.hours) + (Number(r.overtime_hours) ? ` + ${Number(r.overtime_hours)} OT` : '')}
                    </td>
                    <td className="num">{money(r.gross)}</td>
                    <td className="num">{money(r.deductions)}</td>
                    <td className="num"><strong>{money(r.net)}</strong></td>
                    <td>
                      <button className={`badge ${r.status} clickable`} title="Toggle status" onClick={() => toggleStatus(r)}>{r.status}</button>
                    </td>
                    <td className="actions">
                      <button className="btn small ghost" onClick={() => openEdit(r)}>Edit</button>
                      <button className="btn small danger" onClick={() => remove(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total ({rows.length})</td>
                  <td className="num">{money(totals.gross)}</td>
                  <td className="num">{money(totals.deductions)}</td>
                  <td className="num">{money(totals.net)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
