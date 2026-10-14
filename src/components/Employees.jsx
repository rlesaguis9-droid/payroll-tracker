import { useEffect, useState } from 'react'
import { supabase, money } from '../lib.js'

const EMPTY = { full_name: '', email: '', position: '', pay_type: 'hourly', pay_rate: '', active: true }

export default function Employees() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null) // null = closed; object = add/edit
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('employees').select('*').order('full_name')
    if (error) setError(error.message)
    else setRows(data)
  }
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    const { id, created_at, user_id, ...fields } = form
    const payload = { ...fields, pay_rate: Number(fields.pay_rate) || 0 }
    const { error } = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function remove(emp) {
    if (!confirm(`Delete ${emp.full_name}? This also deletes all of their pay entries.`)) return
    const { error } = await supabase.from('employees').delete().eq('id', emp.id)
    if (error) setError(error.message)
    else load()
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const visible = rows.filter((r) => showInactive || r.active)

  return (
    <>
      <div className="page-head">
        <h2>Employees</h2>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
          <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Add employee</button>
        </div>
      </div>

      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {form && (
        <form className="card form-grid" onSubmit={save}>
          <h3 className="span-all">{form.id ? 'Edit employee' : 'New employee'}</h3>
          <label>Full name<input required value={form.full_name} onChange={set('full_name')} /></label>
          <label>Email<input type="email" value={form.email ?? ''} onChange={set('email')} /></label>
          <label>Position<input value={form.position ?? ''} onChange={set('position')} /></label>
          <label>
            Pay type
            <select value={form.pay_type} onChange={set('pay_type')}>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary (per pay period)</option>
            </select>
          </label>
          <label>
            {form.pay_type === 'hourly' ? 'Hourly rate' : 'Salary per pay period'}
            <input type="number" min="0" step="0.01" required value={form.pay_rate} onChange={set('pay_rate')} />
          </label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
          <div className="span-all row end">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary">Save</button>
          </div>
        </form>
      )}

      <div className="card">
        {visible.length === 0 ? (
          <p className="muted">No employees yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Position</th><th>Email</th><th>Pay</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.full_name}</strong></td>
                    <td>{r.position}</td>
                    <td>{r.email}</td>
                    <td>{money(r.pay_rate)}{r.pay_type === 'hourly' ? ' /hr' : ' /period'}</td>
                    <td><span className={`badge ${r.active ? 'paid' : 'inactive'}`}>{r.active ? 'active' : 'inactive'}</span></td>
                    <td className="actions">
                      <button className="btn small ghost" onClick={() => setForm({ ...r })}>Edit</button>
                      <button className="btn small danger" onClick={() => remove(r)}>Delete</button>
                    </td>
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
