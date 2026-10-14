import { useState } from 'react'
import { getTheme, setTheme } from '../lib.js'

const OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match device' },
]

export default function Appearance() {
  const [theme, setThemeState] = useState(getTheme)

  function choose(id) {
    setTheme(id)
    setThemeState(id)
  }

  return (
    <>
      <div className="page-head">
        <h3 className="section-title">Appearance</h3>
      </div>
      <div className="card">
        <div className="setting-row">
          <div>
            <strong>Theme</strong>
            <div className="muted small">Choose light or dark mode. Saved on this device.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={theme === o.id}
                className={theme === o.id ? 'segment active' : 'segment'}
                onClick={() => choose(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
