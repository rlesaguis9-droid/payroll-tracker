import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, round2, downloadCsv } from '../lib.js'
import Modal from './Modal.jsx'
import useConfirm from './useConfirm.jsx'

export default function Commissions() {
  const [confirmDialog, confirm] = useConfirm()
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [banks, setBanks] = useState([])
  const [form, setForm] = useState(null) // editing one commission
  const [bulk, setBulk] = useState(null) // adding: { date, notes, picks: { [employeeId]: { on, service, product, reimbursement } } }
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState({ employee_id: '', from: '', to: '' })
  const [error, setError] = useState(null)

  async function load() {
    let q = supabase
      .from('commissions')
      .select('*, employees(full_name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (filter.employee_id) q = q.eq('employee_id', filter.employee_id)
    if (filter.from) q = q.gte('date', filter.from)
    if (filter.to) q = q.lte('date', filter.to)
    const { data, error } = await q
    if (error) setError(error.message)
    else setRows(data)
  }

  useEffect(() => {
    supabase.from('employees').select('id, full_name, active').order('full_name').then(({ data, error }) => {
      if (error) setError(error.message)
      else setEmployees(data)
    })
    supabase.from('banks').select('*').eq('active', true).order('bank_name').then(({ data }) => setBanks(data || []))
  }, [])

  // "Paid from" choice: a bank id, or 'cash'. Saved as bank_id + a readable label.
  const mask = (n) => (n ? `•••• ${String(n).slice(-4)}` : '')
  const bankLabel = (b) => [b.bank_name, b.account_name, mask(b.account_number)].filter(Boolean).join(' · ')
  function sourceFields(source) {
    if (source === 'cash') return { bank_id: null, paid_from: 'Cash' }
    const bank = banks.find((b) => b.id === source)
    return bank ? { bank_id: bank.id, paid_from: bankLabel(bank) } : { bank_id: null, paid_from: null }
  }
  const sourceOptions = (
    <>
      <option value="">Select…</option>
      {banks.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
      <option value="cash">Cash</option>
    </>
  )
  useEffect(() => { load() }, [filter])

  // Add several employees at once, each with their own service, product and reimbursement amounts.
  function openNew() {
    const picks = filter.employee_id ? { [filter.employee_id]: { on: true, service: '', product: '', reimbursement: '' } } : {}
    setBulk({ date: today(), notes: '', source: '', picks })
  }
  const pick = (id) => bulk.picks[id] || { on: false, service: '', product: '', reimbursement: '' }
  const pickTotal = (p) => (Number(p.service) || 0) + (Number(p.product) || 0) + (Number(p.reimbursement) || 0)
  function setPick(id, changes) {
    const next = { ...pick(id), ...changes }
    // Typing an amount ticks the employee automatically.
    if (('service' in changes || 'product' in changes || 'reimbursement' in changes) && pickTotal(next)) next.on = true
    setBulk({ ...bulk, picks: { ...bulk.picks, [id]: next } })
  }
  const chosen = bulk
    ? Object.entries(bulk.picks).filter(([, p]) => p.on && pickTotal(p))
    : []
  const bulkTotal = chosen.reduce((t, [, p]) => t + pickTotal(p), 0)

  async function saveBulk(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('commissions').insert(chosen.map(([employee_id, p]) => ({
      employee_id,
      date: bulk.date,
      service_commission: round2(Number(p.service) || 0),
      product_commission: round2(Number(p.product) || 0),
      reimbursement: round2(Number(p.reimbursement) || 0),
      notes: bulk.notes || null,
      // status: the database saves new commissions as 'paid' by default
      ...sourceFields(bulk.source),
    })))
    setSaving(false)
    if (error) return setError(error.message)
    setBulk(null)
    load()
  }
  function openEdit(r) {
    const { employees: _, created_at, user_id, ...fields } = r
    const source = r.bank_id || (r.paid_from === 'Cash' ? 'cash' : '')
    setForm({ ...fields, notes: fields.notes ?? '', source })
  }

  async function save(e) {
    e.preventDefault()
    const { id, source, ...f } = form
    const payload = {
      ...f,
      // Keep an old label if the bank it named was since deleted and nothing new was picked.
      ...(source ? sourceFields(source) : {}),
      service_commission: round2(Number(f.service_commission) || 0),
      product_commission: round2(Number(f.product_commission) || 0),
      reimbursement: round2(Number(f.reimbursement) || 0),
    }
    const { error } = id
      ? await supabase.from('commissions').update(payload).eq('id', id)
      : await supabase.from('commissions').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function remove(r) {
    if (!(await confirm('Delete this commission?'))) return
    const { error } = await supabase.from('commissions').delete().eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  function exportCsv() {
    downloadCsv(`commissions-${today()}.csv`, rows.map((r) => ({
      date: r.date,
      employee: r.employees?.full_name,
      service_commission: r.service_commission,
      product_commission: r.product_commission,
      reimbursement: r.reimbursement,
      paid_from: r.paid_from,
      status: r.status,
      notes: r.notes,
    })))
  }

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({
      service: t.service + Number(r.service_commission),
      product: t.product + Number(r.product_commission),
      reimbursement: t.reimbursement + Number(r.reimbursement),
    }),
    { service: 0, product: 0, reimbursement: 0 }
  ), [rows])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })

  return (
    <>
      <div className="page-head">
        <h2>Commissions</h2>
        <div className="row">
          <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          <button className="btn primary" onClick={openNew} disabled={!employees.length}>+ Add commissions</button>
        </div>
      </div>

      {!employees.length && <div className="alert">Add an employee first in Settings → Employees.</div>}
      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {bulk && (
        <Modal title="Add commissions" onClose={() => setBulk(null)} wide>
          <form onSubmit={saveBulk} className="bulk-form">
            <div className="form-grid">
              <label>Date<input type="date" required value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} /></label>
              <label>Paid from
                <select required value={bulk.source} onChange={(e) => setBulk({ ...bulk, source: e.target.value })}>{sourceOptions}</select>
              </label>
              <label>Notes (applies to all)<input value={bulk.notes} placeholder="Optional" onChange={(e) => setBulk({ ...bulk, notes: e.target.value })} /></label>
            </div>
            <p className="muted small">Tick each employee and enter their own amounts. Typing an amount ticks them automatically.</p>
            <div className="bulk-list">
              <div className="bulk-row bulk-head">
                <span>Employee</span><span>Service commission</span><span>Product commission</span><span>Reimbursement</span>
              </div>
              {employees.filter((e) => e.active).map((e) => {
                const p = pick(e.id)
                return (
                  <div key={e.id} className={p.on ? 'bulk-row on' : 'bulk-row'}>
                    <label className="check">
                      <input type="checkbox" checked={p.on} onChange={(ev) => setPick(e.id, { on: ev.target.checked })} />
                      <strong>{e.full_name}</strong>
                    </label>
                    <input type="number" min="0" step="0.01" placeholder="Service ₱" aria-label={`${e.full_name} service commission`}
                      value={p.service} onChange={(ev) => setPick(e.id, { service: ev.target.value })} />
                    <input type="number" min="0" step="0.01" placeholder="Product ₱" aria-label={`${e.full_name} product commission`}
                      value={p.product} onChange={(ev) => setPick(e.id, { product: ev.target.value })} />
                    <input type="number" min="0" step="0.01" placeholder="Reimburse ₱" aria-label={`${e.full_name} reimbursement`}
                      value={p.reimbursement} onChange={(ev) => setPick(e.id, { reimbursement: ev.target.value })} />
                  </div>
                )
              })}
            </div>
            <div className="row end">
              <span className="bulk-total">{chosen.length} employee{chosen.length === 1 ? '' : 's'} · <strong>{money(bulkTotal)}</strong></span>
              <button type="button" className="btn ghost" onClick={() => setBulk(null)}>Cancel</button>
              <button className="btn primary" disabled={!chosen.length || saving}>
                {saving ? 'Saving…' : `Save ${chosen.length || ''} commission${chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {form && (
        <Modal title="Edit commission" onClose={() => setForm(null)}>
        <form className="form-grid" onSubmit={save}>
          <label>Date<input type="date" required value={form.date} onChange={set('date')} /></label>
          <label className="span-2">
            Employee
            <select required value={form.employee_id} onChange={set('employee_id')}>
              <option value="">Select…</option>
              {employees.filter((e) => e.active || e.id === form.employee_id).map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </label>
          <label>Service commission<input type="number" min="0" step="0.01" placeholder="0.00" value={form.service_commission} onChange={set('service_commission')} /></label>
          <label>Product commission<input type="number" min="0" step="0.01" placeholder="0.00" value={form.product_commission} onChange={set('product_commission')} /></label>
          <label>Reimbursement<input type="number" min="0" step="0.01" placeholder="0.00" value={form.reimbursement} onChange={set('reimbursement')} /></label>
          <label>Paid from
            <select value={form.source} onChange={set('source')}>{sourceOptions}</select>
          </label>
          <label className="span-2">Notes<input value={form.notes} onChange={set('notes')} /></label>
          <div className="span-all row end">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary">Save</button>
          </div>
        </form>
        </Modal>
      )}

      <div className="card filters">
        <label>Employee
          <select value={filter.employee_id} onChange={setF('employee_id')}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
        <label>Date from<input type="date" value={filter.from} onChange={setF('from')} /></label>
        <label>to<input type="date" value={filter.to} onChange={setF('to')} /></label>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">No commissions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Employee</th>
                  <th className="num">Service commission</th><th className="num">Product commission</th><th className="num">Reimbursement</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date" className="nowrap">{fmtDate(r.date)}</td>
                    <td className="cell-title">
                      <strong>{r.employees?.full_name}</strong>
                      {r.paid_from && <div className="muted small">Paid from {r.paid_from}</div>}
                      {r.notes && <div className="muted small">{r.notes}</div>}
                    </td>
                    <td data-label="Service commission" className="num">{money(r.service_commission)}</td>
                    <td data-label="Product commission" className="num">{money(r.product_commission)}</td>
                    <td data-label="Reimbursement" className="num">{money(r.reimbursement)}</td>
                    <td data-label="Status">{r.status ? <span className={`badge ${r.status}`}>{r.status}</span> : <span className="muted">—</span>}</td>
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
                  <td data-label="Service commission" className="num">{money(totals.service)}</td>
                  <td data-label="Product commission" className="num">{money(totals.product)}</td>
                  <td data-label="Reimbursement" className="num">{money(totals.reimbursement)}</td>
                  <td colSpan={2} className="hide-sm"></td>
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
