// Per-browser localStorage cache for expensive bootstrap/permutation results.
//
// Why localStorage instead of just useMemo: the heaviest call sites
// (computeRelationship at B=5000) are user-driven — pick (xVar, yVar) in
// InsightsLab, see a 200-300ms recompute. Within one session useMemo handles
// it; reload the tab and the work is repeated. localStorage persists across
// reloads so each (data, args) pair pays once per browser, ever.
//
// Usage:
//   const result = localCache('computeRelationship', `${x}|${y}|${ctrl}`,
//     () => computeRelationship(rows, x, y, opts))
//
// Cache invalidation: keyed on DATA_HASH (derived from teamSeasons + games
// content). When the data changes, all entries become unreachable (different
// key prefix) — old entries leak until the user clears storage. Acceptable
// for a 5MB localStorage budget against tens of KB per entry.

import teamSeasons from '../data/teamSeasons.json'
import games       from '../data/games.json'

const NS = 'ivy:cache:v1'
// 800 KB cap per entry — anything bigger probably means we're caching the
// wrong thing (whole point arrays instead of just the stats).
const PER_ENTRY_CAP = 800 * 1024

function _wpSum(seasons) {
  let s = 0
  for (const t of seasons) s += t.win_pct ?? 0
  return s
}
export const DATA_HASH = `ts${teamSeasons.length}-g${games.length}-wp${_wpSum(teamSeasons).toFixed(3)}`

function _safeStorage() {
  if (typeof window === 'undefined') return null
  try {
    const ls = window.localStorage
    if (!ls) return null
    const probe = '__ivy_cache_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return null  // private browsing / quota / disabled
  }
}

const _store = _safeStorage()

/**
 * Memoize `compute()` against (name, key, DATA_HASH) in localStorage. If the
 * environment has no usable localStorage (SSR, private browsing) the call
 * passes through with no caching.
 *
 * @template T
 * @param {string} name      — caller-chosen function tag, e.g. "detectThreshold"
 * @param {string} key       — small string capturing args that change the result
 * @param {() => T} compute  — the work to memoize
 * @returns {T}
 */
export function localCache(name, key, compute) {
  if (!_store) return compute()
  const fullKey = `${NS}:${name}:${DATA_HASH}:${key}`
  try {
    const raw = _store.getItem(fullKey)
    if (raw !== null) return JSON.parse(raw)
  } catch { /* corrupt entry — fall through */ }

  const result = compute()
  try {
    const payload = JSON.stringify(result)
    if (payload.length <= PER_ENTRY_CAP) _store.setItem(fullKey, payload)
  } catch {
    // Quota exceeded → drop this cache entry but still return the value.
    // Don't try to evict; localStorage doesn't have a clean LRU primitive
    // and getting it wrong wastes more time than re-running the bootstrap.
  }
  return result
}

/**
 * Wipe all entries written under this namespace. Useful for a "force recompute"
 * dev tool or when bumping NS in a migration.
 */
export function clearLocalCache() {
  if (!_store) return
  const toDelete = []
  for (let i = 0; i < _store.length; i++) {
    const k = _store.key(i)
    if (k && k.startsWith(`${NS}:`)) toDelete.push(k)
  }
  for (const k of toDelete) _store.removeItem(k)
}
