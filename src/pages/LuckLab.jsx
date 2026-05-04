import { useMemo, useState } from 'react'
import teamSeasons  from '../data/teamSeasons.json'
import baselineEP   from '../data/baseline_epa.json'
import { runEPAPipeline } from '../utils/epaModels/pipeline.js'
import { pythagoreanWinPctCalibrated } from '../utils/calibration.js'
import { getPythagoreanModel } from '../utils/calibrationCache.js'
import games from '../data/games.json'
import { pearsonCorrelation, pearsonBootstrapCI, pearsonPermutationP } from '../utils/insightEngine.js'
import { localCache } from '../utils/cache.js'
import useEpaStore from '../store/useEpaStore.js'
import PageHeader from '../components/shared/PageHeader.jsx'
import PageConclusions from '../components/shared/PageConclusions.jsx'
import MethodologyPanel from '../components/shared/MethodologyPanel.jsx'
import { T, CARD, SEL, BTN } from '../styles/theme.js'

// Pythagorean exponent, on adjusted ratings (schedule strength stripped out).
// Reads from build-time precomputedStats.json when the data hash matches —
// otherwise falls back to live fit. See utils/calibration.js comments.
const PY_MODEL = getPythagoreanModel(teamSeasons, games, { mode: 'adjusted' })

// ── Empirical regression-to-mean check ──────────────────────────────────────
// Pair every (school, year) row with its (school, year+1) successor and ask:
// does luck this year predict luck next year? If r ≈ 0, the page's "luck
// regresses" claim is supported on this dataset; if r is meaningfully
// positive, the claim is wrong and we should say so.
function computeLuckPersistence(teamSeasons) {
  const idx = new Map(teamSeasons.map(s => [`${s.school}|${s.year}`, s]))
  const pairs = []
  for (const s of teamSeasons) {
    const next = idx.get(`${s.school}|${s.year + 1}`)
    if (!next) continue
    if (s.win_pct == null || next.win_pct == null) continue
    if (s.adjoe == null || s.adjde == null || next.adjoe == null || next.adjde == null) continue
    const pyA = pythagoreanWinPctCalibrated(s,    PY_MODEL)
    const pyB = pythagoreanWinPctCalibrated(next, PY_MODEL)
    if (pyA == null || pyB == null) continue
    pairs.push({
      school: s.school,
      yearT:  s.year,
      luckT:  +(s.win_pct    - pyA).toFixed(3),
      luckT1: +(next.win_pct - pyB).toFixed(3),
    })
  }
  if (pairs.length < 4) return { r: null, n: pairs.length, pairs }
  const xs = pairs.map(p => p.luckT)
  const ys = pairs.map(p => p.luckT1)
  const r  = pearsonCorrelation(xs, ys)
  const ci = pearsonBootstrapCI(xs, ys)
  const p  = pearsonPermutationP(xs, ys)
  return {
    r:      r  == null ? null : +r.toFixed(2),
    ciLow:  ci?.ciLow  != null ? +ci.ciLow.toFixed(2)  : null,
    ciHigh: ci?.ciHigh != null ? +ci.ciHigh.toFixed(2) : null,
    pValue: p  != null ? +p.toFixed(2) : null,
    n: pairs.length,
    pairs,
  }
}

// Heaviest cold-load cost on this page (B=5000 bootstrap + B=5000 permutation).
// localCache makes it a one-time-per-browser hit instead of every reload.
const LUCK_PERSISTENCE = localCache(
  'computeLuckPersistence',
  `pyAlpha=${PY_MODEL.exponent}|mode=${PY_MODEL.mode}`,
  () => computeLuckPersistence(teamSeasons),
)

// ── Luck computation ──────────────────────────────────────────────────────────

function buildLuckRows(teamSeasons, observations) {
  // Map pipeline observations: "Harvard 2022" → residual (actual - predicted net ppp)
  const residualMap = {}
  for (const obs of (observations ?? [])) {
    residualMap[obs.label] = +(obs.actual - obs.predicted).toFixed(2)
  }

  return teamSeasons.map(ts => {
    const pyWinRaw  = pythagoreanWinPctCalibrated(ts, PY_MODEL)
    const pyWin     = pyWinRaw == null ? null : +pyWinRaw.toFixed(3)
    const luckDelta = pyWin == null ? null : +(ts.win_pct - pyWin).toFixed(3)
    const luckGames = luckDelta == null ? null : +(luckDelta * ts.games).toFixed(1)

    const schoolCap = ts.school.charAt(0).toUpperCase() + ts.school.slice(1)
    const label     = `${schoolCap} ${ts.year}`
    const residual  = residualMap[label] ?? null

    return {
      label,
      school:       ts.school,
      schoolCap,
      year:         ts.year,
      record:       ts.record,
      confRecord:   ts.conf_record,
      games:        ts.games,
      winPct:       ts.win_pct,
      pyWin,
      luckDelta,
      luckGames,    // + = lucky (winning more games than efficiency predicts)
      netPPP:       ts.net_ppp,
      residual,     // + = efficiency luck (actual ppp > what four factors predict)
    }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LuckBar({ value, maxAbs }) {
  if (value == null) return <span style={{ color: T.textMin }}>—</span>
  const pct    = Math.min(Math.abs(value) / maxAbs, 1) * 100
  const lucky  = value > 0
  const color  = lucky ? T.amber : T.blue
  const bgColor= lucky ? T.amberBg : T.blueBg
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 72, height: 8, background: T.surf2, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color, borderRadius: 4,
          marginLeft: lucky ? 'auto' : undefined,
          // center the bar: positive fills right half, negative fills left half
        }} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color,
        minWidth: 44, textAlign: 'right', fontFamily: 'monospace',
      }}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  )
}

function LuckBadge({ value, suffix = '' }) {
  if (value == null) return <span style={{ color: T.textMin, fontSize: 12 }}>—</span>
  const lucky = value > 0
  const zero  = Math.abs(value) < 0.001
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
      color: zero ? T.textMin : lucky ? T.amber : T.blue,
    }}>
      {value > 0 ? '+' : ''}{value}{suffix}
    </span>
  )
}

const SORT_OPTIONS = [
  { key: 'luckGames', label: 'Record luck (games)' },
  { key: 'residual',  label: 'Efficiency luck (residual)' },
  { key: 'year',      label: 'Year' },
  { key: 'school',    label: 'School' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LuckLab() {
  const { tier1Result, setTier1Result } = useEpaStore()
  const [yearFilter, setYearFilter] = useState('all')
  const [sortKey, setSortKey]       = useState('luckGames')

  const pipeline = useMemo(() => {
    if (tier1Result.adjusted) return tier1Result.adjusted
    try {
      // adjusted target on raw four-factor predictors: residual = (adjoe-adjde)
      // minus four-factor prediction. Coefficients are biased (predictors don't
      // see opponent strength) but residuals are exactly what we want for luck —
      // execution variance with schedule strength already netted out.
      const result = runEPAPipeline(teamSeasons, { targetMode: 'adjusted', baselineEP })
      setTier1Result(result, 'adjusted')
      return result
    } catch (e) { return { status: 'error', messages: [e.message], observations: [] } }
  }, [tier1Result.adjusted])

  const rows = useMemo(() =>
    buildLuckRows(teamSeasons, pipeline?.observations ?? []),
    [pipeline]
  )

  const years = useMemo(() => [...new Set(teamSeasons.map(ts => ts.year))].sort(), [])

  const filtered = useMemo(() => {
    const base = yearFilter === 'all' ? rows : rows.filter(r => r.year === +yearFilter)
    return [...base].sort((a, b) => {
      if (sortKey === 'school') return a.school.localeCompare(b.school)
      if (sortKey === 'year')   return b.year - a.year || a.school.localeCompare(b.school)
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      return bv - av
    })
  }, [rows, yearFilter, sortKey])

  const maxLuckGames = useMemo(() =>
    Math.max(...rows.map(r => Math.abs(r.luckGames ?? 0)), 1),
    [rows]
  )
  const maxResidual = useMemo(() =>
    Math.max(...rows.map(r => Math.abs(r.residual ?? 0)), 1),
    [rows]
  )

  // Summary stats for header — null luckGames pushed to the end of the sort
  const luckCmp = (a, b) => (b.luckGames ?? -Infinity) - (a.luckGames ?? -Infinity)
  const mostLucky   = [...rows].sort(luckCmp)[0]
  const mostUnlucky = [...rows].sort((a, b) => -luckCmp(a, b))[0]
  const curYear     = Math.max(...years)
  const curRows     = rows.filter(r => r.year === curYear)
  const luckiestCur = [...curRows].sort(luckCmp)[0]

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <PageHeader
        title="Luck Lab"
        subtitle={`Pythagorean luck: actual wins minus expected wins from opponent-adjusted offensive/defensive efficiency (α=${PY_MODEL.exponent}, fitted on ${PY_MODEL.n} team-seasons). Efficiency luck: actual net PPP minus what the four-factor model (eFG%, TOV%, ORB%, FTR) predicts.`}
        stats={[
          { label: 'Luckiest (all-time)',   value: mostLucky   ? `${mostLucky.schoolCap} '${String(mostLucky.year).slice(2)}` : '—',  color: T.amber, note: mostLucky ? `+${mostLucky.luckGames}g` : '' },
          { label: 'Unluckiest (all-time)', value: mostUnlucky ? `${mostUnlucky.schoolCap} '${String(mostUnlucky.year).slice(2)}` : '—', color: T.blue,  note: mostUnlucky ? `${mostUnlucky.luckGames}g` : '' },
          { label: `Luckiest ${curYear}`,   value: luckiestCur ? luckiestCur.schoolCap : '—', color: T.amber, note: luckiestCur ? `+${luckiestCur.luckGames}g` : '' },
        ]}
        controls={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={SEL}>
              <option value="all">All years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={SEL}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        }
      />

      <div style={{ padding: '0 28px 40px' }}>

        {/* Legend */}
        <div style={{ ...CARD, marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>HOW TO READ THIS</div>
            <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.7, maxWidth: 480 }}>
              <span style={{ color: T.amber, fontWeight: 600 }}>Record luck (games above expectation)</span> — positive means a team won more games than their points-per-possession efficiency predicts. Close-game variance. Tends to <em>not</em> persist season to season.
            </div>
            <div style={{ fontSize: 12, color: T.textMd, lineHeight: 1.7, maxWidth: 480, marginTop: 6 }}>
              <span style={{ color: T.blue, fontWeight: 600 }}>Efficiency luck (residual)</span> — positive means a team's opponent-adjusted net efficiency (AdjOE − AdjDE) outran what their four-factor profile (shot quality, turnovers, rebounds, free throws) predicts. Schedule strength is already netted out, so this is closer to true execution variance than a raw-PPP residual.
            </div>
          </div>
          <div style={{ borderLeft: `1px solid ${T.border}`, paddingLeft: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 6 }}>PYTHAGOREAN FORMULA</div>
            <div style={{ fontSize: 11, color: T.textLow, fontFamily: 'monospace', lineHeight: 2 }}>
              Expected win% = AdjOE^α / (AdjOE^α + AdjDE^α), α = {PY_MODEL.exponent}<br/>
              Record luck (games) = (Actual% − Expected%) × Games<br/>
              Efficiency luck = (AdjOE − AdjDE) − Four-factor predicted
            </div>
            <div style={{ fontSize: 10, color: T.textMin, marginTop: 6, lineHeight: 1.5 }}>
              α fitted by least-squares against actual win% across {PY_MODEL.n} team-seasons.
              Adjusted ratings strip out schedule strength so the residual reflects close-game variance, not OOC opponent quality.
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 12 }}>
            {yearFilter === 'all' ? `ALL SEASONS (${filtered.length} team-seasons)` : `${yearFilter} SEASON (${filtered.length} teams)`}
            {' · sorted by '}{SORT_OPTIONS.find(o => o.key === sortKey)?.label}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                <th style={TH}>Team</th>
                <th style={TH}>Year</th>
                <th style={TH}>Record</th>
                <th style={TH}>Conf</th>
                <th style={{ ...TH, textAlign: 'center' }}>Win%</th>
                <th style={{ ...TH, textAlign: 'center' }}>Expected%</th>
                <th style={{ ...TH, textAlign: 'right', color: T.amber }}>Record luck (games)</th>
                <th style={{ ...TH, textAlign: 'center' }}>Net PPP</th>
                <th style={{ ...TH, textAlign: 'right', color: T.blue }}>Efficiency luck</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.label} style={{ borderBottom: `1px solid ${T.border}20` }}>
                  <td style={{ padding: '8px 10px', color: T.text, fontWeight: 600 }}>{r.schoolCap}</td>
                  <td style={{ padding: '8px 10px', color: T.textLow }}>{r.year}</td>
                  <td style={{ padding: '8px 10px', color: T.textMd, fontFamily: 'monospace' }}>{r.record}</td>
                  <td style={{ padding: '8px 10px', color: T.textLow, fontFamily: 'monospace' }}>{r.confRecord}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: T.textMd, fontFamily: 'monospace' }}>
                    {(r.winPct * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: T.textMin, fontFamily: 'monospace' }}>
                    {(r.pyWin * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <LuckBar value={r.luckGames} maxAbs={maxLuckGames} />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: T.textMd, fontFamily: 'monospace' }}>
                    {r.netPPP > 0 ? '+' : ''}{r.netPPP?.toFixed(1)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <LuckBadge value={r.residual} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Current-year callout */}
        <div style={{ ...CARD, marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.accentSoft, marginBottom: 12 }}>
            {curYear} LUCK RANKINGS
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[...curRows]
              .sort((a, b) => b.luckGames - a.luckGames)
              .map((r, i) => {
                const lucky = r.luckGames > 0
                const zero  = Math.abs(r.luckGames) < 0.3
                return (
                  <div key={r.label} style={{
                    flex: '1 1 160px',
                    background: zero ? T.surf2 : lucky ? `${T.amber}18` : `${T.blue}18`,
                    border: `1px solid ${zero ? T.border : lucky ? `${T.amber}40` : `${T.blue}40`}`,
                    borderRadius: 8, padding: '12px 14px',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                      #{i + 1} {r.schoolCap}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: zero ? T.textLow : lucky ? T.amber : T.blue, fontFamily: 'monospace' }}>
                      {r.luckGames > 0 ? '+' : ''}{r.luckGames}g
                    </div>
                    <div style={{ fontSize: 11, color: T.textLow, marginTop: 4 }}>
                      {r.record} · exp {(r.pyWin * 100).toFixed(0)}%
                    </div>
                    {r.residual != null && (
                      <div style={{ fontSize: 11, color: T.textMin, marginTop: 2 }}>
                        eff Δ {r.residual > 0 ? '+' : ''}{r.residual} ppp
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>

        <PageConclusions prominent conclusions={[
          {
            label: 'Record luck — empirical persistence',
            color: T.amber,
            text: (() => {
              const lp = LUCK_PERSISTENCE
              if (lp.r == null) {
                return `Not enough consecutive-season pairs (n=${lp.n}) to verify whether luck persists year-to-year.`
              }
              const ciStr = (lp.ciLow != null && lp.ciHigh != null) ? ` (95% CI [${lp.ciLow}, ${lp.ciHigh}])` : ''
              const pStr  = lp.pValue != null ? `, permutation p=${lp.pValue}` : ''
              const ciStraddlesZero = lp.ciLow != null && lp.ciHigh != null && lp.ciLow <= 0 && lp.ciHigh >= 0
              const significant = lp.pValue != null && lp.pValue < 0.05
              const headline = `On this dataset (n=${lp.n} consecutive-season pairs, 2022–25), the year-to-year correlation of record luck is r=${lp.r}${ciStr}${pStr}.`
              if (ciStraddlesZero || !significant) {
                return `${headline} The CI straddles zero, so we can't distinguish persistence from noise on n=${lp.n}. The conventional "luck regresses to the mean" intuition is consistent with the data but not strongly verified — treat year-over-year predictions cautiously.`
              }
              if (lp.r > 0) {
                return `${headline} Record luck shows positive year-over-year persistence beyond chance — a team that overperformed its PPP last year tends to do so again. That contradicts the textbook "luck regresses" claim and likely reflects a stable coaching/clutch-execution trait rather than pure variance.`
              }
              return `${headline} Record luck reverses sign year-over-year more than chance — strong empirical regression-to-mean.`
            })(),
          },
          { label: 'Efficiency luck is different', color: T.blue, text: 'A positive efficiency residual means a team\'s actual net PPP exceeded what their four-factor profile (eFG%, TOV%, ORB%, FTR) predicts. This can reflect opponent quality mismatch, free-throw over-performance, or genuine execution above the model\'s four-factor signal.' },
          { label: 'Both can co-exist', color: T.accentSoft, text: 'A team can be efficiency-unlucky (poor four-factor residual) but record-lucky (won close games anyway), or vice versa. The two metrics measure different layers of randomness: one at the possession level, one at the game-outcome level.' },
        ]} />

        <MethodologyPanel
          howItWorks={'Pythagorean luck uses the standard college basketball Pythagorean formula (exponent 10) to estimate the win% a team "deserves" given their scoring efficiency. The residual compares to the EPA four-factor regression: how much of a team\'s net PPP is explained by shot quality, turnovers, rebounds, and free throw rate — and how much is unexplained.'}
          sections={[
            { title: 'Luck Metrics',  keys: ['pythagorean_win_pct', 'record_luck', 'efficiency_luck'] },
            { title: 'Efficiency',    keys: ['net_efficiency', 'adjoe', 'adjde', 'barthag'] },
            { title: 'Four Factors',  keys: ['efg_o', 'efg_d', 'tov_o', 'tov_d', 'orb', 'drb', 'ftr_o', 'ftr_d'] },
            { title: 'Record',        keys: ['win_pct', 'conf_win_pct'] },
          ]}
        />
      </div>
    </div>
  )
}

const TH = {
  textAlign: 'left',
  padding: '6px 10px',
  color: T.textLow,
  fontWeight: 500,
  whiteSpace: 'nowrap',
}
