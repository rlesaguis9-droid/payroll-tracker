import { useEffect, useState } from 'react'
import {
  supabase, money, fmtDate, today, thisMonth, round2, calcGross, egovForPeriod, cutoffs, nextCutoff, payLabel,
} from '../lib.js'
import Modal from './Modal.jsx'

const STEPS = ['Employee', 'Details', 'Paid from', 'Summary']
const mask = (n) => (n ? `•••• ${String(n).slice(-4)}` : '')
const bankLabel = (b) => [b.bank_name, b.account_name, mask(b.account_number)].filter(Boolean).join(' · ')

// Quick Entry: a step-by-step popup for recording a salary or commission payment.
// Employee → salary cutoff or commission → where the money came from → summary → submit.
export default function QuickEntry() {
  const [open, setOpen] = useState(true) // opens as soon as the tab is chosen
  const [recent, setRecent] = useState([])

  async function loadRecent() {
    const [pay, com] = await Promise.all([
      supabase.from('payroll_entries').select('id, pay_date, net, status, paid_from, created_at, employees(full_name)')
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('commissions').select('id, date, service_commission, product_commission, paid_from, created_at, employees(full_name)')
        .order('created_at', { ascending: false }).limit(8),
    ])
    setRecent([
      ...(pay.data || []).map((r) => ({ id: `p-${r.id}`, kind: 'payroll', date: r.pay_date, created_at: r.created_at, name: r.employees?.full_name, amount: Number(r.net), from: r.paid_from })),
      ...(com.data || []).map((r) => ({ id: `c-${r.id}`, kind: 'commission', date: r.date, created_at: r.created_at, name: r.employees?.full_name, amount: Number(r.service_commission) + Number(r.product_commission), from: r.paid_from })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8))
  }
  useEffect(() => { loadRecent() }, [])

  return (
    <>
      <div className="quick-hero card">
        <h2>Quick Entry</h2>
        <p className="muted">Record a salary or commission payment in a few steps.</p>
        <button className="btn primary big" onClick={() => setOpen(true)}>+ New entry</button>
      </div>

      <div className="card">
        <h3>Recently added</h3>
        {recent.length === 0 ? (
          <p className="muted">Nothing yet. Your saved entries will show here and in the Record Book.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Employee</th><th>Date</th><th>Paid from</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Type"><span className={`badge kind-${r.kind}`}>{r.kind === 'payroll' ? 'Salary' : 'Commission'}</span></td>
                    <td className="cell-title"><strong>{r.name}</strong></td>
                    <td data-label="Date">{fmtDate(r.date)}</td>
                    <td data-label="Paid from">{r.from || <span className="muted">—</span>}</td>
                    <td data-label="Amount" className="num">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <Wizard onClose={() => setOpen(false)} onSaved={loadRecent} />}
    </>
  )
}

const START = {
  employee_id: '', kind: '',
  month: nextCutoff().month, cutoff: nextCutoff().id, gross: '', deductions: '',
  date: today(), service: '', product: '',
  source: '', notes: '',
}

function Wizard({ onClose, onSaved }) {
  const [step, setStep] = useState(0)
  const [d, setD] = useState(START)
  const [employees, setEmployees] = useState(null)
  const [banks, setBanks] = useState([])
  const [duplicate, setDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('employees').select('*').eq('active', true).order('full_name').then(({ data }) => setEmployees(data || []))
    supabase.from('banks').select('*').eq('active', true).order('bank_name').then(({ data }) => setBanks(data || []))
  }, [])

  const employee = (employees || []).find((e) => e.id === d.employee_id)
  const cut = cutoffs(d.month).find((c) => c.id === Number(d.cutoff))
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })

  // Salary: standard half-month pay, EGOV only on the 30th cutoff (editable).
  useEffect(() => {
    if (d.kind === 'salary' && employee && cut) {
      setD((x) => ({ ...x, gross: calcGross(employee), deductions: egovForPeriod(employee, cut.period_start) }))
    }
  }, [d.kind, d.employee_id, d.month, d.cutoff])

  // Warn before paying the same cutoff twice.
  useEffect(() => {
    setDuplicate(false)
    if (d.kind !== 'salary' || !employee || !cut) return
    let current = true // ignore answers for a cutoff the user has already moved away from
    supabase.from('payroll_entries').select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id).eq('period_start', cut.period_start).eq('period_end', cut.period_end)
      .then(({ count }) => current && setDuplicate(count > 0))
    return () => { current = false }
  }, [d.kind, d.employee_id, d.month, d.cutoff])

  const net = round2((Number(d.gross) || 0) - (Number(d.deductions) || 0))
  const commissionTotal = round2((Number(d.service) || 0) + (Number(d.product) || 0))
  const bank = banks.find((b) => b.id === d.source)
  const paidFrom = d.source === 'cash' ? 'Cash' : bank ? bankLabel(bank) : ''

  const canNext = [
    !!d.employee_id,
    d.kind === 'salary' ? !!cut && Number(d.gross) > 0 && !duplicate : d.kind === 'commission' && commissionTotal > 0 && !!d.date,
    !!d.source,
  ]

  async function submit() {
    setSaving(true)
    setError(null)
    const common = { employee_id: d.employee_id, bank_id: bank?.id ?? null, paid_from: paidFrom, notes: d.notes || null }
    const { error } = d.kind === 'salary'
      ? await supabase.from('payroll_entries').insert({
          ...common, period_start: cut.period_start, period_end: cut.period_end, pay_date: cut.pay_date,
          gross: round2(Number(d.gross)), deductions: round2(Number(d.deductions) || 0), status: 'paid',
        })
      : await supabase.from('commissions').insert({
          ...common, date: d.date,
          service_commission: round2(Number(d.service) || 0), product_commission: round2(Number(d.product) || 0),
        })
    setSaving(false)
    if (error) return setError(error.message)
    setDone(true)
    onSaved()
  }

  function again() {
    setD(START)
    setStep(0)
    setDone(false)
  }

  if (done) {
    return (
      <Modal title="Saved" onClose={onClose}>
        <div className="wizard-done">
          <div className="done-check" aria-hidden="true">✓</div>
          <p><strong>{d.kind === 'salary' ? 'Salary' : 'Commission'} for {employee?.full_name}</strong> is recorded in the Record Book.</p>
        </div>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn primary" onClick={again}>New entry</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Quick Entry" onClose={onClose}>
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'complete' : ''}>{s}</li>
        ))}
      </ol>

      {error && <div className="alert error">{error}</div>}

      {step === 0 && (
        <div className="wizard-step">
          <h4>Who is being paid?</h4>
          {employees?.length === 0 ? (
            <div className="alert">Add an employee first in Settings → Employees.</div>
          ) : (
            <label>Employee
              <select value={d.employee_id} onChange={set('employee_id')}>
                <option value="">Select employee…</option>
                {(employees || []).map((e) => <option key={e.id} value={e.id}>{e.full_name} — {payLabel(e)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wizard-step">
          <h4>What are you paying {employee?.full_name}?</h4>
          <div className="choice-grid">
            {[['salary', 'Salary', 'A 15th or 30th cutoff'], ['commission', 'Commission', 'Service and/or product']].map(([id, label, hint]) => (
              <button key={id} type="button" className={d.kind === id ? 'choice active' : 'choice'} onClick={() => setD({ ...d, kind: id })}>
                <strong>{label}</strong><span className="muted small">{hint}</span>
              </button>
            ))}
          </div>

          {d.kind === 'salary' && (
            <div className="form-grid">
              <label>Month<input type="month" value={d.month} onChange={(e) => e.target.value && setD({ ...d, month: e.target.value })} /></label>
              <label>Cutoff
                <select value={d.cutoff} onChange={set('cutoff')}>
                  {cutoffs(d.month).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}: {fmtDate(c.period_start)} – {fmtDate(c.period_end)}</option>
                  ))}
                </select>
              </label>
              <label>Gross pay<input type="number" min="0" step="0.01" value={d.gross} onChange={set('gross')} /></label>
              <label>Deductions (EGOV)<input type="number" min="0" step="0.01" value={d.deductions} onChange={set('deductions')} /></label>
              <div className="span-all wizard-total">
                <span className="muted">Net pay, paid {cut && fmtDate(cut.pay_date)}</span><strong>{money(net)}</strong>
              </div>
              {duplicate && <div className="span-all alert error">This cutoff is already recorded for {employee?.full_name}.</div>}
            </div>
          )}

          {d.kind === 'commission' && (
            <div className="form-grid">
              <label>Date<input type="date" value={d.date} onChange={set('date')} /></label>
              <label>Service commission<input type="number" min="0" step="0.01" placeholder="0.00" value={d.service} onChange={set('service')} /></label>
              <label>Product commission<input type="number" min="0" step="0.01" placeholder="0.00" value={d.product} onChange={set('product')} /></label>
              <div className="span-all wizard-total"><span className="muted">Total commission</span><strong>{money(commissionTotal)}</strong></div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="wizard-step">
          <h4>Where is the payment coming from?</h4>
          <div className="choice-list">
            {banks.map((b) => (
              <button key={b.id} type="button" className={d.source === b.id ? 'choice active' : 'choice'} onClick={() => setD({ ...d, source: b.id })}>
                <strong>{b.bank_name}</strong>
                <span className="muted small">{[b.account_name, mask(b.account_number), b.branch].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            <button type="button" className={d.source === 'cash' ? 'choice active' : 'choice'} onClick={() => setD({ ...d, source: 'cash' })}>
              <strong>Cash</strong><span className="muted small">Paid in cash</span>
            </button>
          </div>
          {banks.length === 0 && <p className="muted small">Add your bank accounts in Settings → Banks to choose them here.</p>}
        </div>
      )}

      {step === 3 && (
        <div className="wizard-step">
          <h4>Check and submit</h4>
          <dl className="summary">
            <dt>Employee</dt><dd>{employee?.full_name}</dd>
            <dt>Type</dt><dd>{d.kind === 'salary' ? `Salary · ${cut?.label}` : 'Commission'}</dd>
            {d.kind === 'salary' ? (
              <>
                <dt>Period</dt><dd>{fmtDate(cut.period_start)} – {fmtDate(cut.period_end)}</dd>
                <dt>Pay date</dt><dd>{fmtDate(cut.pay_date)}</dd>
                <dt>Gross pay</dt><dd>{money(d.gross)}</dd>
                <dt>Deductions (EGOV)</dt><dd>{money(d.deductions || 0)}</dd>
                <dt className="total">Net pay</dt><dd className="total">{money(net)}</dd>
              </>
            ) : (
              <>
                <dt>Date</dt><dd>{fmtDate(d.date)}</dd>
                <dt>Service commission</dt><dd>{money(d.service || 0)}</dd>
                <dt>Product commission</dt><dd>{money(d.product || 0)}</dd>
                <dt className="total">Total</dt><dd className="total">{money(commissionTotal)}</dd>
              </>
            )}
            <dt>Paid from</dt><dd>{paidFrom}</dd>
          </dl>
          <label>Notes<input value={d.notes} onChange={set('notes')} placeholder="Optional" /></label>
        </div>
      )}

      <div className="row end">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step === 0 && <button type="button" className="btn primary" disabled={!canNext[0]} onClick={() => setStep(1)}>Next</button>}
        {step === 1 && (
          <button type="button" className="btn primary" disabled={!canNext[1]} onClick={() => setStep(2)}>
            {d.kind === 'salary' ? 'Paid' : 'Next'}
          </button>
        )}
        {step === 2 && <button type="button" className="btn primary" disabled={!canNext[2]} onClick={() => setStep(3)}>Next</button>}
        {step === 3 && <button type="button" className="btn primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Submit'}</button>}
      </div>
    </Modal>
  )
}
