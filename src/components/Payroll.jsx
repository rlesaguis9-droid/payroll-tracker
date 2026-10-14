import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, calcGross, round2, downloadCsv, payLabel, cutoffs, nextCutoff, egovForPeriod, cutoffForDate } from '../lib.js'
import Modal from './Modal.jsx'
import useConfirm from './useConfirm.jsx'

const EMPTY = {
  employee_id: '', pay_date: today(),
  hours: '', overtime_hours: '', gross: '', deductions: '', status: 'pending', notes: '',
}

// Cutoffs for last month, this month and next month, for the quick-fill dropdown.
function nearbyCutoffs() {
  const d = new Date(); d.setDate(1)
  return [-1, 0, 1].flatMap((offset) => {
    const m = new Date(d.getFullYear(), d.getMonth() + offset, 1)
    const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    const name = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    return cutoffs(month).map((c) => ({ ...c, key: `${month}-${c.id}`, name: `${name} · ${c.label}` }))
  })
}

export default function Payroll() {
  const [confirmDialog, confirm] = useConfirm()
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(null)
  const [grossEdited, setGrossEdited] = useState(false)
  const [error, setError] = useState(null)
  const [run, setRun] = useState(null) // { month, cutoff } when the semi-monthly run panel is open
  const [busy, setBusy] = useState(false)

  async function load() {
    let q = supabase
      .from('payroll_entries')
      .select('*, employees(full_name, pay_type)')
      .order('pay_date', { ascending: false })
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
  useEffect(() => { load() }, [])

  const employee = employees.find((e) => e.id === form?.employee_id)
  const monthlyEmployees = employees.filter((e) => e.active && e.pay_type === 'monthly')

  // Auto-calculate gross until the user types their own value.
  useEffect(() => {
    if (form && !grossEdited) setForm((f) => ({ ...f, gross: calcGross(employee, f.hours, f.overtime_hours) || '' }))
  }, [form?.employee_id, form?.hours, form?.overtime_hours, grossEdited])

  // New entries: pre-fill EGOV deductions (full monthly amount on the 30th cutoff, none on the 15th).
  useEffect(() => {
    if (form && !form.id && employee) setForm((f) => ({ ...f, deductions: egovForPeriod(employee, f.pay_date) || '' }))
  }, [form?.employee_id, form?.pay_date])

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
    // The pay period is no longer entered; it's the semi-monthly cutoff the pay date falls in.
    const { period_start, period_end } = cutoffForDate(f.pay_date)
    const payload = {
      ...f,
      period_start,
      period_end,
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

  function applyCutoff(key) {
    const c = nearbyCutoffs().find((x) => x.key === key)
    if (c) setForm({ ...form, pay_date: c.pay_date })
  }

  // Semi-monthly run: one pending entry per active monthly employee for the chosen cutoff.
  const runCutoff = run ? cutoffs(run.month).find((c) => c.id === run.cutoff) : null
  const [existing, setExisting] = useState([])
  useEffect(() => {
    if (!runCutoff) return
    supabase.from('payroll_entries').select('employee_id')
      .eq('period_start', runCutoff.period_start).eq('period_end', runCutoff.period_end)
      .then(({ data }) => setExisting((data || []).map((r) => r.employee_id)))
  }, [run?.month, run?.cutoff, rows])
  const toCreate = runCutoff ? monthlyEmployees.filter((e) => !existing.includes(e.id)) : []

  function openRun() {
    const n = nextCutoff()
    setRun({ month: n.month, cutoff: n.id })
  }

  async function createRun() {
    setBusy(true)
    const payload = toCreate.map((e) => ({
      employee_id: e.id,
      period_start: runCutoff.period_start,
      period_end: runCutoff.period_end,
      pay_date: runCutoff.pay_date,
      gross: calcGross(e),
      deductions: egovForPeriod(e, runCutoff.period_start),
      status: 'pending',
    }))
    const { error } = await supabase.from('payroll_entries').insert(payload)
    setBusy(false)
    if (error) return setError(error.message)
    setRun(null)
    load()
  }

  async function toggleStatus(r) {
    const status = r.status === 'paid' ? 'pending' : 'paid'
    const { error } = await supabase.from('payroll_entries').update({ status }).eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  async function remove(r) {
    if (!(await confirm('Delete this pay entry?'))) return
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
  const net = round2((Number(form?.gross) || 0) - (Number(form?.deductions) || 0))

  return (
    <>
      <div className="page-head">
        <h2>Payroll</h2>
        <div className="row">
          <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          <button className="btn ghost" onClick={openRun} disabled={!monthlyEmployees.length}>Run 15th / 30th payroll</button>
          <button className="btn primary" onClick={openNew} disabled={!employees.length}>+ New pay entry</button>
        </div>
      </div>

      {!employees.length && <div className="alert">Add an employee first in Settings → Employees.</div>}
      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {run && (
        <Modal title="Run 15th / 30th payroll" onClose={() => setRun(null)} wide>
          <p className="muted small">Creates a pending pay entry for every active monthly-salary employee: half their monthly salary. EGOV (SSS, PAG-IBIG, PhilHealth and loans) is deducted in full on the 30th cutoff.</p>
          <div className="form-grid">
            <label>Month<input type="month" required value={run.month} onChange={(e) => e.target.value && setRun({ ...run, month: e.target.value })} /></label>
            <label>Cutoff
              <select value={run.cutoff} onChange={(e) => setRun({ ...run, cutoff: Number(e.target.value) })}>
                {cutoffs(run.month).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}: {fmtDate(c.period_start)} – {fmtDate(c.period_end)}, paid {fmtDate(c.pay_date)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap run-preview">
            <table>
              <thead><tr><th>Employee</th><th className="num">Monthly salary</th><th className="num">Gross</th><th className="num">EGOV</th><th className="num">Net</th><th></th></tr></thead>
              <tbody>
                {monthlyEmployees.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-title">{e.full_name}</td>
                    <td data-label="Monthly salary" className="num">{money(e.monthly_salary)}</td>
                    <td data-label="Gross" className="num">{money(calcGross(e))}</td>
                    <td data-label="EGOV" className="num">{money(egovForPeriod(e, runCutoff.period_start))}</td>
                    <td data-label="Net" className="num"><strong>{money(calcGross(e) - egovForPeriod(e, runCutoff.period_start))}</strong></td>
                    <td data-label="">{existing.includes(e.id) && <span className="badge inactive">already added</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="cell-title">Total to create ({toCreate.length})</td>
                  <td data-label="Total gross" className="num">{money(toCreate.reduce((t, e) => t + calcGross(e), 0))}</td>
                  <td data-label="Total EGOV" className="num">{money(toCreate.reduce((t, e) => t + egovForPeriod(e, runCutoff.period_start), 0))}</td>
                  <td data-label="Total net" className="num">{money(toCreate.reduce((t, e) => t + calcGross(e) - egovForPeriod(e, runCutoff.period_start), 0))}</td>
                  <td className="hide-sm"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="row end">
            <button type="button" className="btn ghost" onClick={() => setRun(null)}>Cancel</button>
            <button className="btn primary" disabled={!toCreate.length || busy} onClick={createRun}>
              {busy ? 'Creating…' : `Create ${toCreate.length} pay entr${toCreate.length === 1 ? 'y' : 'ies'}`}
            </button>
          </div>
        </Modal>
      )}

      {form && (
        <Modal title={form.id ? 'Edit pay entry' : 'New pay entry'} onClose={() => setForm(null)}>
        <form className="form-grid" onSubmit={save}>
          <label className="span-2">
            Employee
            <select required value={form.employee_id} onChange={set('employee_id')}>
              <option value="">Select…</option>
              {employees.filter((e) => e.active || e.id === form.employee_id).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} — {payLabel(e)}
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
          {employee?.pay_type === 'monthly' && (
            <label className="span-all">
              Cutoff (sets the pay date)
              <select value="" onChange={(e) => applyCutoff(e.target.value)}>
                <option value="">Choose a cutoff…</option>
                {nearbyCutoffs().map((c) => <option key={c.key} value={c.key}>{c.name} (paid {fmtDate(c.pay_date)})</option>)}
              </select>
            </label>
          )}
          <label>Pay date<input type="date" required value={form.pay_date} onChange={set('pay_date')} /></label>
          {employee?.pay_type === 'hourly' && (
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
        </Modal>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">No pay entries yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th><th>Pay date</th>
                  <th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title"><strong>{r.employees?.full_name}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                    <td data-label="Pay date" className="nowrap">{fmtDate(r.pay_date)}</td>
                    <td data-label="Gross" className="num">{money(r.gross)}</td>
                    <td data-label="Deductions" className="num">{money(r.deductions)}</td>
                    <td data-label="Net" className="num"><strong>{money(r.net)}</strong></td>
                    <td data-label="Status">
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
                  <td colSpan={2} className="cell-title">Total ({rows.length})</td>
                  <td data-label="Total gross" className="num">{money(totals.gross)}</td>
                  <td data-label="Total deductions" className="num">{money(totals.deductions)}</td>
                  <td data-label="Total net" className="num">{money(totals.net)}</td>
                  <td className="hide-sm" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {confirmDialog}
    </>
  )
}
