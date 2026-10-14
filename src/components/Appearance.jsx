import { useState } from 'react'
import { getTheme, setTheme, TEXT_SIZES, getTextSize, setTextSize } from '../lib.js'

const OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match device' },
]

export default function Appearance() {
  const [theme, setThemeState] = useState(getTheme)
  const [textSize, setTextSizeState] = useState(getTextSize)

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
        <div className="setting-row setting-divider">
          <div>
            <strong>Text size</strong>
            <div className="muted small">Make all text in the app smaller or bigger. Saved on this device.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={textSize === t.id}
                className={textSize === t.id ? 'segment active' : 'segment'}
                style={{ fontSize: `${t.scale * 14}px` }}
                onClick={() => { setTextSize(t.id); setTextSizeState(t.id) }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
