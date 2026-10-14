import { useState } from 'react'
import Employees from './Employees.jsx'
import Appearance from './Appearance.jsx'

// Add more settings pages here; each gets a button in the sub-navigation.
const SECTIONS = [
  { id: 'employees', label: 'Employees', component: Employees },
  { id: 'appearance', label: 'Appearance', component: Appearance },
]

export default function Settings() {
  const [section, setSection] = useState(SECTIONS[0].id)
  const Current = SECTIONS.find((s) => s.id === section).component

  return (
    <>
      <div className="page-head">
        <h2>Settings</h2>
      </div>
      <nav className="subnav">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'subnav-item active' : 'subnav-item'} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <Current />
    </>
  )
}
