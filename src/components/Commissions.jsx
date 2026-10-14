import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, today, round2, downloadCsv } from '../lib.js'
import Modal from './Modal.jsx'

const EMPTY = { date: today(), employee_id: '', service_commission: '', product_commission: '', notes: '' }

export default function Commissions() {
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(null)
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
  }, [])
  useEffect(() => { load() }, [filter])

  function openNew() {
    setForm({ ...EMPTY, employee_id: filter.employee_id })
  }
  function openEdit(r) {
    const { employees: _, created_at, user_id, ...fields } = r
    setForm({ ...fields, notes: fields.notes ?? '' })
  }

  async function save(e) {
    e.preventDefault()
    const { id, ...f } = form
    const payload = {
      ...f,
      service_commission: round2(Number(f.service_commission) || 0),
      product_commission: round2(Number(f.product_commission) || 0),
    }
    const { error } = id
      ? await supabase.from('commissions').update(payload).eq('id', id)
      : await supabase.from('commissions').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function remove(r) {
    if (!confirm('Delete this commission?')) return
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
      notes: r.notes,
    })))
  }

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ service: t.service + Number(r.service_commission), product: t.product + Number(r.product_commission) }),
    { service: 0, product: 0 }
  ), [rows])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })

  return (
    <>
      <div className="page-head">
        <h2>Commissions</h2>
        <div className="row">
          <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          <button className="btn primary" onClick={openNew} disabled={!employees.length}>+ Add commission</button>
        </div>
      </div>

      {!employees.length && <div className="alert">Add an employee first in Settings → Employees.</div>}
      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {form && (
        <Modal title={form.id ? 'Edit commission' : 'Add commission'} onClose={() => setForm(null)}>
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
          <label className="span-all">Notes<input value={form.notes} onChange={set('notes')} /></label>
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
                  <th className="num">Service commission</th><th className="num">Product commission</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date" className="nowrap">{fmtDate(r.date)}</td>
                    <td className="cell-title"><strong>{r.employees?.full_name}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                    <td data-label="Service commission" className="num">{money(r.service_commission)}</td>
                    <td data-label="Product commission" className="num">{money(r.product_commission)}</td>
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
