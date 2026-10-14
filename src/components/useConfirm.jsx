import { useState } from 'react'
import Modal from './Modal.jsx'

// In-app "Are you sure?" popup. Replaces window.confirm, which some phone and
// in-app browsers block (it silently answers "Cancel").
//   const [confirmDialog, confirm] = useConfirm()
//   if (!(await confirm('Delete this?'))) return
//   ...render {confirmDialog} somewhere in the component
export default function useConfirm() {
  const [pending, setPending] = useState(null) // { message, resolve }

  const confirm = (message) => new Promise((resolve) => setPending({ message, resolve }))
  const answer = (yes) => {
    pending.resolve(yes)
    setPending(null)
  }

  const dialog = pending && (
    <Modal title="Are you sure?" onClose={() => answer(false)}>
      <p className="confirm-message">{pending.message}</p>
      <div className="row end">
        <button type="button" className="btn ghost" autoFocus onClick={() => answer(false)}>Cancel</button>
        <button type="button" className="btn danger-solid" onClick={() => answer(true)}>Delete</button>
      </div>
    </Modal>
  )

  return [dialog, confirm]
}
