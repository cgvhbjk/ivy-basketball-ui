// Cache wrapper has two responsibilities:
//   1. In a browser with usable localStorage, memoize across calls.
//   2. In any environment where storage is missing/unavailable (Node tests,
//      private browsing, quota-exceeded), pass through cleanly without
//      changing the result the caller sees.
//
// We mainly pin (2) here — losing pass-through silently would break SSR/test
// runs in confusing ways. (1) is exercised in real use; mocking localStorage
// to verify hit/miss logic just re-tests the standard library.

import { describe, expect, it } from 'vitest'
import { localCache, DATA_HASH } from '../cache.js'

describe('localCache', () => {
  it('passes through in environments without localStorage', () => {
    let calls = 0
    const compute = () => { calls++; return { v: 42 } }
    const a = localCache('test', 'k1', compute)
    const b = localCache('test', 'k1', compute)
    expect(a).toEqual({ v: 42 })
    expect(b).toEqual({ v: 42 })
    // Without localStorage, both calls must execute the function. (With it,
    // calls would stay at 1; we don't pin that here to keep the test
    // environment-independent.)
    expect(calls).toBe(2)
  })

  it('returns whatever the compute function returns, including non-JSON falsy values', () => {
    expect(localCache('test', 'null', () => null)).toBeNull()
    expect(localCache('test', 'zero', () => 0)).toBe(0)
    expect(localCache('test', 'empty', () => '')).toBe('')
  })

  it('exposes a stable DATA_HASH derived from teamSeasons + games content', () => {
    expect(DATA_HASH).toMatch(/^ts\d+-g\d+-wp[\d.]+$/)
  })
})
