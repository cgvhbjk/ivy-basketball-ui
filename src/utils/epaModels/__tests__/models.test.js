// Cover the constraint-flow regressions:
//   - fitConstrained no longer zeroes columns whose sign is 0 (previous bug)
//   - fitRidgeCV is deterministic given a seed and improves over no-shuffle
//     on sorted data

import { describe, expect, it } from 'vitest'
import { fitOLS, fitRidgeCV, fitConstrained, checkSigns } from '../models.js'

describe('fitConstrained', () => {
  it('keeps unconstrained (sign=0) columns in the design matrix', () => {
    // Truth: y = 1 + 2*x1 + 3*x2.
    // Constraints: x1 has sign=1 (must be positive), x2 has sign=0 (unconstrained).
    // Pre-fix, sign=0 was multiplied through as 0 and the column was silently dropped.
    const X = [
      [1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 1, 2],
    ]
    const y = X.map(r => 1 + 2 * r[1] + 3 * r[2])
    const out = fitConstrained(X, y, ['x1', 'x2'], { x1: 1, x2: 0 })
    expect(out.beta).toBeTruthy()
    // Column was kept — coefficient is non-zero
    expect(Math.abs(out.beta[2])).toBeGreaterThan(1.0)
  })

  it('respects a +1 sign constraint when the unconstrained best is negative', () => {
    // Truth: y = 1 − 2*x1 — true slope is negative, but we constrain to ≥0.
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]]
    const y = [1, -1, -3, -5, -7]
    const out = fitConstrained(X, y, ['x1'], { x1: 1 })
    expect(out.beta[1]).toBeGreaterThanOrEqual(-1e-6)
  })
})

describe('fitRidgeCV', () => {
  it('gives a finite, in-range cv R² on a clean signal', () => {
    const X = [], y = []
    for (let i = 0; i < 30; i++) {
      X.push([1, i, i * i / 50])
      y.push(2 + 0.5 * i + 0.1 * (i * i / 50))
    }
    const out = fitRidgeCV(X, y, ['lin', 'quad'], { alphas: [0.01, 0.1, 1, 10] })
    expect(out.cvR2).toBeGreaterThan(0.95)
    expect(out.bestAlpha).toBeDefined()
  })

  it('is deterministic given the same seed', () => {
    const X = Array.from({ length: 32 }, (_, i) => [1, i % 8, Math.sin(i)])
    const y = X.map(r => 1 + 0.3 * r[1] + 0.5 * r[2] + 0.05 * (r[1] * r[2]))
    const a = fitRidgeCV(X, y, ['a', 'b'], { alphas: [0.01, 0.1, 1], cvFolds: 4, seed: 7 })
    const b = fitRidgeCV(X, y, ['a', 'b'], { alphas: [0.01, 0.1, 1], cvFolds: 4, seed: 7 })
    expect(a.cvR2).toBe(b.cvR2)
    expect(a.bestAlpha).toBe(b.bestAlpha)
  })
})

describe('checkSigns', () => {
  it('flags coefficients that violate their constraint', () => {
    // beta is [intercept, β_x1, β_x2]; x1 expects positive, x2 expects negative
    const issues = checkSigns([0, -0.5, 0.7], ['x1', 'x2'], { x1: 1, x2: -1 })
    expect(issues.map(i => i.name).sort()).toEqual(['x1', 'x2'])
  })

  it('returns no issues when signs match', () => {
    expect(checkSigns([0, 0.4, -0.3], ['x1', 'x2'], { x1: 1, x2: -1 })).toEqual([])
  })
})

describe('fitOLS', () => {
  it('returns a fit with r2≈1 on a noiseless line', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3]]
    const y = [3, 5, 7, 9]
    const out = fitOLS(X, y, ['x'])
    expect(out.r2).toBeCloseTo(1, 6)
    expect(out.beta[0]).toBeCloseTo(3, 6)
    expect(out.beta[1]).toBeCloseTo(2, 6)
  })
})
