import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, calcGross, round2, downloadCsv, payLabel, cutoffs, nextCutoff, egovForPeriod, cutoffForDate } from '../lib.js'
import Modal from './Modal.jsx'
import useConfirm from './useConfirm.jsx'

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
  // Adding pay entries for several employees at once:
  // { pay_date, status, source, notes, picks: { [employeeId]: { on, gross, deductions } } }
  // gross / deductions stay null until typed, so they follow the standard amounts for the chosen date.
  const [bulk, setBulk] = useState(null)
  const [banks, setBanks] = useState([])
  const [taken, setTaken] = useState([]) // employees already paid for the chosen cutoff

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
    supabase.from('banks').select('*').eq('active', true).order('bank_name').then(({ data }) => setBanks(data || []))
  }, [])
  useEffect(() => { load() }, [])

  const employee = employees.find((e) => e.id === form?.employee_id)
  const monthlyEmployees = employees.filter((e) => e.active && e.pay_type === 'monthly')

  // Auto-calculate gross until the user types their own value.
  useEffect(() => {
    if (form && !grossEdited) setForm((f) => ({ ...f, gross: calcGross(employee, f.hours, f.overtime_hours) || '' }))
  }, [form?.employee_id, form?.hours, form?.overtime_hours, grossEdited])

  function openNew() {
    setBulk({ pay_date: nextCutoff().pay_date, status: 'pending', source: '', notes: '', picks: {} })
  }

  // Which employees already have an entry for the cutoff this pay date falls in.
  useEffect(() => {
    if (!bulk?.pay_date) return
    const { period_start, period_end } = cutoffForDate(bulk.pay_date)
    let current = true
    supabase.from('payroll_entries').select('employee_id').eq('period_start', period_start).eq('period_end', period_end)
      .then(({ data }) => current && setTaken((data || []).map((r) => r.employee_id)))
    return () => { current = false }
  }, [bulk?.pay_date])

  const pick = (e) => {
    const p = bulk.picks[e.id] || { on: false, gross: null, deductions: null }
    return {
      ...p,
      gross: p.gross ?? (calcGross(e) || ''),
      deductions: p.deductions ?? (egovForPeriod(e, bulk.pay_date) || ''),
    }
  }
  function setPick(id, changes) {
    const prev = bulk.picks[id] || { on: false, gross: null, deductions: null }
    const next = { ...prev, ...changes }
    if ('gross' in changes && Number(changes.gross)) next.on = true // typing a gross ticks the employee
    setBulk({ ...bulk, picks: { ...bulk.picks, [id]: next } })
  }
  const activeEmployees = employees.filter((e) => e.active)
  const chosen = bulk ? activeEmployees.filter((e) => bulk.picks[e.id]?.on && !taken.includes(e.id) && Number(pick(e).gross) > 0) : []
  const bulkNet = chosen.reduce((t, e) => t + (Number(pick(e).gross) || 0) - (Number(pick(e).deductions) || 0), 0)
  const available = activeEmployees.filter((e) => !taken.includes(e.id))
  const allOn = !!bulk && available.length > 0 && available.every((e) => bulk.picks[e.id]?.on)
  function toggleAll() {
    const picks = { ...bulk.picks }
    for (const e of activeEmployees) if (!taken.includes(e.id)) picks[e.id] = { ...(picks[e.id] || { gross: null, deductions: null }), on: !allOn }
    setBulk({ ...bulk, picks })
  }

  const mask = (n) => (n ? `•••• ${String(n).slice(-4)}` : '')
  const bankLabel = (b) => [b.bank_name, b.account_name, mask(b.account_number)].filter(Boolean).join(' · ')
  function sourceFields(source) {
    if (source === 'cash') return { bank_id: null, paid_from: 'Cash' }
    const bank = banks.find((b) => b.id === source)
    return bank ? { bank_id: bank.id, paid_from: bankLabel(bank) } : {}
  }

  async function saveBulk(ev) {
    ev.preventDefault()
    setBusy(true)
    const { period_start, period_end } = cutoffForDate(bulk.pay_date)
    const { error } = await supabase.from('payroll_entries').insert(chosen.map((e) => ({
      employee_id: e.id,
      pay_date: bulk.pay_date,
      period_start,
      period_end,
      gross: round2(Number(pick(e).gross) || 0),
      deductions: round2(Number(pick(e).deductions) || 0),
      status: bulk.status,
      notes: bulk.notes || null,
      ...sourceFields(bulk.source),
    })))
    setBusy(false)
    if (error) return setError(error.message)
    setBulk(null)
    load()
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
          <p className="muted small">Creates a pending pay entry for every active monthly-salary employee: half their monthly salary, minus half their monthly EGOV (SSS, PAG-IBIG, PhilHealth and loans).</p>
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

      {bulk && (
        <Modal title="New pay entries" onClose={() => setBulk(null)} wide>
          <form onSubmit={saveBulk} className="bulk-form">
            <div className="form-grid">
              <label>Pay date<input type="date" required value={bulk.pay_date} onChange={(e) => setBulk({ ...bulk, pay_date: e.target.value })} /></label>
              <label>Status
                <select value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label>Paid from
                <select value={bulk.source} onChange={(e) => setBulk({ ...bulk, source: e.target.value })}>
                  <option value="">Not set</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="span-all">Notes (applies to all)<input value={bulk.notes} placeholder="Optional" onChange={(e) => setBulk({ ...bulk, notes: e.target.value })} /></label>
            </div>
            <p className="muted small">
              {(() => { const c = cutoffForDate(bulk.pay_date); return `${c.label}: ${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}. ` })()}
              Tick the employees to pay. Gross and EGOV are filled in for monthly employees; change any amount as needed.
            </p>
            <div className="bulk-list">
              <div className="bulk-row pay-row bulk-head">
                <label className="check"><input type="checkbox" checked={allOn} disabled={!available.length} onChange={toggleAll} aria-label="Select all" /> Employee</label>
                <span>Gross pay</span><span>Deductions (EGOV)</span><span className="num">Net</span>
              </div>
              {activeEmployees.map((e) => {
                const p = pick(e)
                const done = taken.includes(e.id)
                return (
                  <div key={e.id} className={p.on && !done ? 'bulk-row pay-row on' : 'bulk-row pay-row'}>
                    <label className="check">
                      <input type="checkbox" checked={p.on && !done} disabled={done} onChange={(ev) => setPick(e.id, { on: ev.target.checked })} />
                      <span><strong>{e.full_name}</strong><span className="muted small"> {done ? '· already recorded for this cutoff' : `· ${payLabel(e)}`}</span></span>
                    </label>
                    <input type="number" min="0" step="0.01" placeholder="Gross ₱" disabled={done} aria-label={`${e.full_name} gross pay`}
                      value={p.gross} onChange={(ev) => setPick(e.id, { gross: ev.target.value })} />
                    <input type="number" min="0" step="0.01" placeholder="EGOV ₱" disabled={done} aria-label={`${e.full_name} deductions`}
                      value={p.deductions} onChange={(ev) => setPick(e.id, { deductions: ev.target.value })} />
                    <span className="num">{done ? '—' : money((Number(p.gross) || 0) - (Number(p.deductions) || 0))}</span>
                  </div>
                )
              })}
            </div>
            <div className="row end">
              <span className="bulk-total">{chosen.length} employee{chosen.length === 1 ? '' : 's'} · net <strong>{money(bulkNet)}</strong></span>
              <button type="button" className="btn ghost" onClick={() => setBulk(null)}>Cancel</button>
              <button className="btn primary" disabled={!chosen.length || busy}>
                {busy ? 'Saving…' : `Save ${chosen.length || ''} pay entr${chosen.length === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {form && (
        <Modal title="Edit pay entry" onClose={() => setForm(null)}>
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
