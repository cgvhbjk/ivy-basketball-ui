// Central design tokens — all UI colors and common style objects
// Import as: import { T, CARD, SEL, BTN } from '../styles/theme.js'

export const T = {
  // ── Backgrounds (dark grey, no blue tint) ──────────────────────────────
  bg:       '#111111',   // page background
  bgDeep:   '#0c0c0c',   // deepest (table headers, navbar)
  surf:     '#191919',   // card / panel surface
  surf2:    '#222222',   // input, stat chip, inner card
  surf3:    '#161616',   // slightly darker card variant

  // ── Borders ────────────────────────────────────────────────────────────
  border:   '#2c2c2c',
  borderMd: '#383838',

  // ── Text ───────────────────────────────────────────────────────────────
  text:     '#ebebeb',   // primary
  textMd:   '#a3a3a3',   // secondary
  textLow:  '#737373',   // muted / labels
  textMin:  '#4a4a4a',   // minimum / very muted

  // ── Accent (indigo family — keeps brand identity) ──────────────────────
  accent:    '#6366f1',
  accentLt:  '#818cf8',
  accentSoft:'#a5b4fc',

  // ── Status ─────────────────────────────────────────────────────────────
  green:    '#10b981',
  greenBg:  '#10b98120',
  red:      '#ef4444',
  redBg:    '#ef444420',
  amber:    '#f59e0b',
  amberBg:  '#f59e0b20',
  blue:     '#3b82f6',
  blueBg:   '#3b82f620',
  purple:   '#a78bfa',
  purpleBg: '#a78bfa20',
  cyan:     '#22d3ee',
}

// ── Reusable style objects ──────────────────────────────────────────────────

export const CARD = {
  background:   T.surf,
  border:       `1px solid ${T.border}`,
  borderRadius: 12,
  padding:      '20px 24px',
}

export const CARD_SM = {
  background:   T.surf,
  border:       `1px solid ${T.border}`,
  borderRadius: 10,
  padding:      '14px 16px',
}

export const SEL = {
  background:   T.surf2,
  border:       `1px solid ${T.border}`,
  color:        T.text,
  borderRadius: 6,
  padding:      '6px 10px',
  fontSize:     13,
  outline:      'none',
}

export const BTN = (active, color = T.accent) => ({
  padding:      '5px 12px',
  borderRadius: 6,
  fontSize:     12,
  fontWeight:   500,
  cursor:       'pointer',
  border:       'none',
  background:   active ? color : T.surf2,
  color:        active ? '#fff' : T.textMd,
  transition:   'all .15s',
})

export const SECTION_TITLE = {
  fontSize:   13,
  fontWeight: 600,
  color:      T.accentSoft,
  marginBottom: 12,
}

export const STAT_CHIP = {
  background:   T.surf2,
  borderRadius: 8,
  padding:      '8px 12px',
  textAlign:    'center',
}
