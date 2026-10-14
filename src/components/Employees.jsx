import { useEffect, useState } from 'react'
import { supabase, money, payLabel, EGOV_FIELDS, egovMonthly, egovForPeriod } from '../lib.js'
import Modal from './Modal.jsx'
import useConfirm from './useConfirm.jsx'

const EMPTY = { full_name: '', email: '', position: '', pay_type: 'monthly', monthly_salary: '', pay_rate: '', active: true,
  sss_contribution: '', sss_loan: '', pagibig_contribution: '', pagibig_loan: '', philhealth_contribution: '' }

export default function Employees() {
  const [confirmDialog, confirm] = useConfirm()
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
    const payload = { ...fields, pay_rate: Number(fields.pay_rate) || 0, monthly_salary: Number(fields.monthly_salary) || 0 }
    for (const k of EGOV_FIELDS) payload[k] = Number(fields[k]) || 0
    const { error } = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function remove(emp) {
    if (!(await confirm(`Delete ${emp.full_name}? This also deletes all of their pay entries.`))) return
    const { error } = await supabase.from('employees').delete().eq('id', emp.id)
    if (error) setError(error.message)
    else load()
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const visible = rows.filter((r) => showInactive || r.active)

  return (
    <>
      <div className="page-head">
        <h3 className="section-title">Employees</h3>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
          <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Add employee</button>
        </div>
      </div>

      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {form && (
        <Modal title={form.id ? 'Edit employee' : 'New employee'} onClose={() => setForm(null)} wide>
        <form className="form-grid" onSubmit={save}>
          <label>Full name<input required value={form.full_name} onChange={set('full_name')} /></label>
          <label>Email<input type="email" value={form.email ?? ''} onChange={set('email')} /></label>
          <label>Position<input value={form.position ?? ''} onChange={set('position')} /></label>
          <label>
            Pay type
            <select value={form.pay_type} onChange={set('pay_type')}>
              <option value="monthly">Monthly salary (paid 15th &amp; 30th)</option>
              <option value="hourly">Hourly</option>
            </select>
          </label>
          {form.pay_type === 'monthly' ? (
            <label>
              Salary per month
              <input type="number" min="0" step="0.01" required value={form.monthly_salary} onChange={set('monthly_salary')} />
              {Number(form.monthly_salary) > 0 && (
                <span className="muted small">{money(form.monthly_salary / 2)} every 15th and 30th</span>
              )}
            </label>
          ) : (
            <label>
              Hourly rate
              <input type="number" min="0" step="0.01" required value={form.pay_rate} onChange={set('pay_rate')} />
            </label>
          )}
          <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>

          <fieldset className="span-all egov">
            <legend>EGOV <span className="muted small">monthly government contributions</span></legend>
            <div className="egov-grid">
              <div className="egov-group">
                <h4>SSS</h4>
                <label><span>Contribution (monthly) <span className="req">*</span></span>
                  <input type="number" min="0" step="0.01" required value={form.sss_contribution} onChange={set('sss_contribution')} />
                </label>
                <label><span>SSS loan (monthly) <span className="muted small">optional</span></span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={form.sss_loan || ''} onChange={set('sss_loan')} />
                </label>
              </div>
              <div className="egov-group">
                <h4>PAG-IBIG</h4>
                <label><span>Contribution (monthly) <span className="req">*</span></span>
                  <input type="number" min="0" step="0.01" required value={form.pagibig_contribution} onChange={set('pagibig_contribution')} />
                </label>
                <label><span>PAG-IBIG loan (monthly) <span className="muted small">optional</span></span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={form.pagibig_loan || ''} onChange={set('pagibig_loan')} />
                </label>
              </div>
              <div className="egov-group">
                <h4>PhilHealth</h4>
                <label><span>Contribution (monthly) <span className="req">*</span></span>
                  <input type="number" min="0" step="0.01" required value={form.philhealth_contribution} onChange={set('philhealth_contribution')} />
                </label>
              </div>
            </div>
            <div className="egov-total">
              <span>Total EGOV per month <strong>{money(egovMonthly(form))}</strong></span>
              <span className="muted">{money(egovForPeriod(form, '0000-00-01'))} deducted on the 15th, {money(egovForPeriod(form, '0000-00-16'))} on the 30th</span>
            </div>
          </fieldset>
          <div className="span-all row end">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary">Save</button>
          </div>
        </form>
        </Modal>
      )}

      <div className="card">
        {visible.length === 0 ? (
          <p className="muted">No employees yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Position</th><th>Email</th><th>Pay</th><th>EGOV / month</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title"><strong>{r.full_name}</strong></td>
                    <td data-label="Position">{r.position}</td>
                    <td data-label="Email">{r.email}</td>
                    <td data-label="Pay">{payLabel(r)}</td>
                    <td data-label="EGOV / month">{money(egovMonthly(r))}</td>
                    <td data-label="Status"><span className={`badge ${r.active ? 'paid' : 'inactive'}`}>{r.active ? 'active' : 'inactive'}</span></td>
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
      {confirmDialog}
    </>
  )
}
