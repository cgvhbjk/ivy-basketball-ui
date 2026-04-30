import { useState } from 'react'
import { T, CARD } from '../../styles/theme.js'
import { GLOSSARY } from '../../data/glossary.js'

// MethodologyPanel — collapsible page-level methodology reference.
//
// Props:
//   sections  — array of { title, intro?, keys: string[] }
//               keys are GLOSSARY keys; unlisted keys are silently skipped.
//   howItWorks — optional string or JSX rendered before the term sections.

function GlossaryRow({ entry, term }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${T.border}20` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 0', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{entry.label}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
            color: entry.type === 'derived' ? T.accentSoft : T.textLow,
            background: entry.type === 'derived' ? `${T.accent}20` : T.surf2,
            borderRadius: 3, padding: '1px 5px',
          }}>
            {entry.type === 'derived' ? 'derived' : 'raw'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: T.textMin }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 10, paddingLeft: 2 }}>
          <p style={{ fontSize: 12, color: T.textMd, lineHeight: 1.65, margin: '0 0 6px' }}>
            {entry.definition}
          </p>
          {entry.calc && (
            <div style={{ fontSize: 11, color: T.textMin, fontFamily: 'monospace' }}>
              Formula: {entry.calc}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MethodologyPanel({ sections = [], howItWorks }) {
  const [open, setOpen] = useState(false)

  if (!sections.length) return null

  return (
    <div style={{ ...CARD, marginTop: 24 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textLow, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Methodology &amp; Glossary
        </span>
        <span style={{ fontSize: 11, color: T.textMin }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          {howItWorks && (
            <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.7, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 16 }}>
              {howItWorks}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0 32px' }}>
            {sections.map(({ title, intro, keys }) => {
              const entries = keys.map(k => ({ key: k, entry: GLOSSARY[k] })).filter(x => x.entry)
              if (!entries.length) return null
              return (
                <div key={title} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {title}
                  </div>
                  {intro && (
                    <p style={{ fontSize: 11, color: T.textLow, lineHeight: 1.6, marginBottom: 8 }}>{intro}</p>
                  )}
                  {entries.map(({ key, entry }) => (
                    <GlossaryRow key={key} entry={entry} term={key} />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
