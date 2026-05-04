// Pin the linear-algebra primitives. Three callers depend on these
// (epaModels itself, powerRating, insightEngine._mlr) so a regression here
// would propagate everywhere.

import { describe, expect, it } from 'vitest'
import { transpose, matMul, inverse, ridgeSolve, olsSolve, computeFit, nnls, zeros } from '../matrixOps.js'

const closeTo = (actual, expected, digits = 6) => {
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], digits)
  }
}

describe('matrix primitives', () => {
  it('transpose works on rectangular input', () => {
    expect(transpose([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]])
  })

  it('matMul is correct on hand-computed example', () => {
    const A = [[1, 2], [3, 4]]
    const B = [[5, 6], [7, 8]]
    expect(matMul(A, B)).toEqual([[19, 22], [43, 50]])
  })

  it('inverse is the identity-recovering inverse', () => {
    const A = [[4, 7], [2, 6]]
    const Ainv = inverse(A)
    closeTo(matMul(A, Ainv).flat(), [1, 0, 0, 1])
  })

  it('zeros() returns a fresh r×c grid each call', () => {
    const a = zeros(2, 3); a[0][0] = 9
    const b = zeros(2, 3)
    expect(b[0][0]).toBe(0)
  })
})

describe('olsSolve', () => {
  it('recovers the slope and intercept of a noiseless line', () => {
    // y = 3 + 2x
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]]
    const y = [3, 5, 7, 9, 11]
    closeTo(olsSolve(X, y), [3, 2])
  })

  it('matches a hand-computed multivariate fit', () => {
    // y = 1 + 2*x1 + 3*x2
    const X = [
      [1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1],
      [1, 2, 1], [1, 1, 2], [1, 2, 2], [1, 3, 1],
    ]
    const y = X.map(r => 1 + 2 * r[1] + 3 * r[2])
    closeTo(olsSolve(X, y), [1, 2, 3])
  })
})

describe('ridgeSolve', () => {
  it('λ=0 collapses to OLS', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3]]
    const y = [1, 3, 5, 7]
    closeTo(ridgeSolve(X, y, 0), olsSolve(X, y))
  })

  it('large λ shrinks the slope toward zero', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]]
    const y = [3, 5, 7, 9, 11]
    const ols   = olsSolve(X, y)
    const ridge = ridgeSolve(X, y, 1000)
    expect(Math.abs(ridge[1])).toBeLessThan(Math.abs(ols[1]))
  })
})

describe('computeFit', () => {
  it('reports r2 = 1 on a noiseless fit', () => {
    const X = [[1, 0], [1, 1], [1, 2]]
    const y = [3, 5, 7]
    const beta = olsSolve(X, y)
    const fit  = computeFit(X, y, beta)
    expect(fit.r2).toBeCloseTo(1, 6)
    expect(fit.rmse).toBeCloseTo(0, 6)
  })
})

describe('nnls', () => {
  it('zeros out a coefficient whose unconstrained best is negative', () => {
    // Truth: y = 2x1 − 3x2 + ε. With x≥0 constraint, x2's optimum is 0.
    const X = [[1, 1], [1, 2], [2, 1], [3, 1], [2, 2]]
    const y = [-1, -4, 1, 5, -2]
    const beta = nnls(X, y)
    expect(beta[0]).toBeGreaterThanOrEqual(0)
    expect(beta[1]).toBeCloseTo(0, 6)
  })

  it('matches the unconstrained solution when all coefficients are positive', () => {
    // Truth: y = 1 + 2x — a single-feature non-negative problem.
    const X = [[1], [2], [3], [4], [5]]
    const y = [2.1, 4.0, 6.1, 8.0, 10.0]
    const ols = olsSolve(X, y)
    const beta = nnls(X, y)
    expect(beta[0]).toBeCloseTo(ols[0], 4)
  })
})
