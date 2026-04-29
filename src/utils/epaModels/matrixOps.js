// Pure matrix math — no external dependencies, no React imports.
// All matrices are arrays of rows: M[row][col].

export function zeros(r, c) {
  return Array.from({ length: r }, () => new Array(c).fill(0))
}

export function transpose(A) {
  return A[0].map((_, j) => A.map(row => row[j]))
}

export function matMul(A, B) {
  const m = A.length, k = A[0].length, n = B[0].length
  const C = zeros(m, n)
  for (let i = 0; i < m; i++)
    for (let l = 0; l < k; l++)
      for (let j = 0; j < n; j++)
        C[i][j] += A[i][l] * B[l][j]
  return C
}

// Gauss-Jordan elimination — returns M⁻¹ or throws if singular
export function inverse(M) {
  const n = M.length
  const A = M.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row
    }
    ;[A[col], A[maxRow]] = [A[maxRow], A[col]]
    const pivot = A[col][col]
    if (Math.abs(pivot) < 1e-12)
      throw new Error('Singular matrix — features are perfectly collinear')
    for (let j = 0; j < 2 * n; j++) A[col][j] /= pivot
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = A[row][col]
      for (let j = 0; j < 2 * n; j++) A[row][j] -= f * A[col][j]
    }
  }
  return A.map(row => row.slice(n))
}

// β = (X'X + λI)⁻¹ X'y  (λ=0 → OLS, λ>0 → ridge)
// X must already be standardized if you want regularized ridge
export function ridgeSolve(X, y, lambda = 0) {
  const Xt  = transpose(X)
  const XtX = matMul(Xt, X)
  const n   = XtX.length
  // Add ridge penalty to diagonal (skip intercept at index 0 if present)
  for (let i = 0; i < n; i++) XtX[i][i] += lambda
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0))
  return inverse(XtX).map(row => row.reduce((s, v, i) => s + v * Xty[i], 0))
}

// Convenience wrapper: OLS = ridge with λ=0
export function olsSolve(X, y) {
  return ridgeSolve(X, y, 0)
}

// Compute R², adjR², RMSE, and predictions for a fitted model
export function computeFit(X, y, beta) {
  const n     = y.length
  const p     = beta.length - 1
  const yHat  = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0))
  const yMean = y.reduce((s, v) => s + v, 0) / n
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = y.reduce((s, v, i) => s + (v - yHat[i]) ** 2, 0)
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0
  const adjR2 = ssTot > 0 && n > p + 1
    ? 1 - (ssRes / (n - p - 1)) / (ssTot / (n - 1)) : r2
  return {
    n, p,
    r2:    +r2.toFixed(4),
    adjR2: +adjR2.toFixed(4),
    rmse:  +(Math.sqrt(ssRes / n)).toFixed(3),
    yHat,
  }
}

// Non-negative least squares via Lawson-Hanson active set.
// Solves: min ||Ax - b||² subject to x ≥ 0
export function nnls(A, b, { maxIter = 400, tol = 1e-10 } = {}) {
  const n   = A[0].length
  let x     = new Array(n).fill(0)
  const passive = new Set()

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient w = A'(b - Ax)
    const Ax = A.map(row => row.reduce((s, v, j) => s + v * x[j], 0))
    const r  = b.map((bi, i) => bi - Ax[i])
    const w  = Array.from({ length: n }, (_, j) =>
      A.reduce((s, row, i) => s + row[j] * r[i], 0)
    )

    // Check KKT: max w over active set
    let jMax = -1, wMax = -Infinity
    for (let j = 0; j < n; j++) {
      if (!passive.has(j) && w[j] > wMax) { wMax = w[j]; jMax = j }
    }
    if (jMax === -1 || wMax <= tol) break

    passive.add(jMax)

    // Inner loop: project onto non-negative orthant
    for (let inner = 0; inner < maxIter; inner++) {
      const pArr = [...passive]
      const Ap = A.map(row => pArr.map(j => row[j]))
      let s
      try { s = olsSolve(Ap, b) } catch { break }

      if (s.every(v => v > tol)) {
        pArr.forEach((j, i) => { x[j] = s[i] })
        for (let j = 0; j < n; j++) if (!passive.has(j)) x[j] = 0
        break
      }

      // Line search to boundary
      let alpha = Infinity
      pArr.forEach((j, i) => {
        if (s[i] <= tol) {
          const a = x[j] / (x[j] - s[i] + 1e-30)
          if (a < alpha) alpha = a
        }
      })

      pArr.forEach((j, i) => { x[j] = x[j] + alpha * (s[i] - x[j]) })
      pArr.forEach(j => {
        if (x[j] <= tol) { passive.delete(j); x[j] = 0 }
      })
      if (passive.size === 0) break
    }
  }

  return x
}
