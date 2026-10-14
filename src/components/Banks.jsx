import { useEffect, useState } from 'react'
import { supabase } from '../lib.js'
import Modal from './Modal.jsx'
import useConfirm from './useConfirm.jsx'

const EMPTY = { bank_name: '', account_name: '', account_number: '', branch: '', notes: '', active: true }

// Show only the last 4 digits until revealed.
const mask = (n) => (n ? `•••• ${String(n).slice(-4)}` : '')

export default function Banks() {
  const [confirmDialog, confirm] = useConfirm()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [revealed, setRevealed] = useState({})
  const [error, setError] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('banks').select('*').order('bank_name')
    if (error) setError(error.message)
    else setRows(data)
  }
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    const { id, created_at, user_id, ...payload } = form
    const { error } = id
      ? await supabase.from('banks').update(payload).eq('id', id)
      : await supabase.from('banks').insert(payload)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  async function remove(bank) {
    if (!(await confirm(`Delete ${bank.bank_name}${bank.account_number ? ` (${mask(bank.account_number)})` : ''}?`))) return
    const { error } = await supabase.from('banks').delete().eq('id', bank.id)
    if (error) setError(error.message)
    else load()
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <>
      <div className="page-head">
        <h3 className="section-title">Banks</h3>
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ Add bank</button>
      </div>

      {error && <div className="alert error" onClick={() => setError(null)}>{error}</div>}

      {form && (
        <Modal title={form.id ? 'Edit bank' : 'New bank'} onClose={() => setForm(null)}>
        <form className="form-grid" onSubmit={save}>
          <label>Bank name<input required placeholder="e.g. BDO, BPI, Metrobank" value={form.bank_name} onChange={set('bank_name')} /></label>
          <label>Account name<input value={form.account_name ?? ''} onChange={set('account_name')} /></label>
          <label>Account number<input inputMode="numeric" autoComplete="off" value={form.account_number ?? ''} onChange={set('account_number')} /></label>
          <label>Branch<input value={form.branch ?? ''} onChange={set('branch')} /></label>
          <label className="span-2">Notes<input value={form.notes ?? ''} onChange={set('notes')} /></label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
          <div className="span-all row end">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary">Save</button>
          </div>
        </form>
        </Modal>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">No banks yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Bank</th><th>Account name</th><th>Account number</th><th>Branch</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title"><strong>{r.bank_name}</strong>{r.notes && <div className="muted small">{r.notes}</div>}</td>
                    <td data-label="Account name">{r.account_name}</td>
                    <td data-label="Account number" className="nowrap">
                      {r.account_number && (
                        <>
                          {revealed[r.id] ? r.account_number : mask(r.account_number)}{' '}
                          <button className="link inline" onClick={() => setRevealed({ ...revealed, [r.id]: !revealed[r.id] })}>
                            {revealed[r.id] ? 'hide' : 'show'}
                          </button>
                        </>
                      )}
                    </td>
                    <td data-label="Branch">{r.branch}</td>
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
