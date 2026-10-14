import { useEffect, useRef } from 'react'

// Popup dialog used for every add/edit form. Closes on Esc, the × button, or a click outside.
// `inline` draws the same popup centered in the page instead of over it (no dimming, can't be
// closed), so the tabs stay usable — used by Quick Entry, which is always the popup.
export default function Modal({ title, onClose, children, wide = false, inline = false }) {
  const panel = useRef(null)

  useEffect(() => {
    // Put the cursor in the first field so typing can start right away.
    panel.current?.querySelector('input:not([type=checkbox]), select, textarea')?.focus()
    if (inline) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [])

  const dialog = (
    <div className={wide ? 'modal wide' : 'modal'} role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : true} aria-label={title} ref={panel}>
      <div className="modal-head">
        <h3>{title}</h3>
        {onClose && <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>}
      </div>
      <div className="modal-body">{children}</div>
    </div>
  )

  if (inline) return <div className="modal-inline">{dialog}</div>
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {dialog}
    </div>
  )
}
