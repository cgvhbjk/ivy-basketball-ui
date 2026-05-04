// k-means clustering with k-means++ init + silhouette score for k selection.
//
// Used by Phase 4 #2 (replacing heuristic scheme classification with empirical
// clusters). Self-contained so it has no dependency on the rest of the stats
// stack — pure functions, deterministic via mulberry32 seed.

function _mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function _euclidSq(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return s
}

function _meanVec(rows, dim) {
  const out = new Array(dim).fill(0)
  for (const r of rows) for (let i = 0; i < dim; i++) out[i] += r[i]
  for (let i = 0; i < dim; i++) out[i] /= rows.length
  return out
}

/**
 * Z-score each column independently. Returns the standardized matrix plus the
 * per-column mean/sd so callers can reverse the transform on centroids if
 * needed.
 *
 * @param {number[][]} rows
 * @returns {{ X: number[][], means: number[], sds: number[] }}
 */
export function zscore(rows) {
  if (!rows.length) return { X: [], means: [], sds: [] }
  const dim = rows[0].length
  const means = new Array(dim).fill(0)
  const sds   = new Array(dim).fill(0)
  for (const r of rows) for (let i = 0; i < dim; i++) means[i] += r[i]
  for (let i = 0; i < dim; i++) means[i] /= rows.length
  for (const r of rows) for (let i = 0; i < dim; i++) sds[i] += (r[i] - means[i]) ** 2
  for (let i = 0; i < dim; i++) sds[i] = Math.sqrt(sds[i] / Math.max(1, rows.length - 1)) || 1
  const X = rows.map(r => r.map((v, i) => (v - means[i]) / sds[i]))
  return { X, means, sds }
}

/**
 * k-means++ initial centroid selection. Picks the first centroid uniformly,
 * then biases subsequent picks toward points far from any existing centroid
 * (probability proportional to squared distance). Reduces sensitivity to
 * Lloyd's-algorithm local minima.
 */
function _kmeansPlusPlusInit(X, k, rand) {
  const n = X.length
  const centroids = []
  centroids.push(X[Math.floor(rand() * n)].slice())
  while (centroids.length < k) {
    const d2 = new Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      let best = Infinity
      for (const c of centroids) {
        const d = _euclidSq(X[i], c)
        if (d < best) best = d
      }
      d2[i] = best
      total += best
    }
    if (total === 0) {
      // All points already coincident with chosen centroids — fall back to
      // a random pick so we don't loop forever.
      centroids.push(X[Math.floor(rand() * n)].slice())
      continue
    }
    let target = rand() * total
    let pickedIdx = 0
    for (let i = 0; i < n; i++) {
      target -= d2[i]
      if (target <= 0) { pickedIdx = i; break }
    }
    centroids.push(X[pickedIdx].slice())
  }
  return centroids
}

/**
 * Lloyd's algorithm. Caller is responsible for standardizing X if features
 * have different scales (use `zscore` above).
 *
 * @param {number[][]} X         — n × d feature matrix
 * @param {number}     k         — number of clusters
 * @param {{ seed?: number, maxIter?: number, tol?: number, restarts?: number }} [opts]
 * @returns {{ labels: number[], centroids: number[][], inertia: number, converged: boolean, iterations: number }}
 */
export function kmeans(X, k, opts = {}) {
  const { seed = 1, maxIter = 100, tol = 1e-6, restarts = 5 } = opts
  if (X.length < k) throw new Error(`kmeans: n=${X.length} < k=${k}`)
  const dim = X[0].length

  let best = null
  for (let r = 0; r < restarts; r++) {
    const rand = _mulberry32(seed + r * 1009)
    let centroids = _kmeansPlusPlusInit(X, k, rand)
    let labels = new Array(X.length).fill(0)
    let prevInertia = Infinity
    let converged = false
    let iter = 0

    for (iter = 0; iter < maxIter; iter++) {
      // Assign: each point → nearest centroid
      let inertia = 0
      for (let i = 0; i < X.length; i++) {
        let bestC = 0, bestD = Infinity
        for (let c = 0; c < k; c++) {
          const d = _euclidSq(X[i], centroids[c])
          if (d < bestD) { bestD = d; bestC = c }
        }
        labels[i] = bestC
        inertia += bestD
      }

      // Update: recompute centroids; reseed any empty cluster from the
      // farthest-from-centroid point so we don't degenerate.
      const sums = Array.from({ length: k }, () => new Array(dim).fill(0))
      const counts = new Array(k).fill(0)
      for (let i = 0; i < X.length; i++) {
        const c = labels[i]
        counts[c]++
        for (let j = 0; j < dim; j++) sums[c][j] += X[i][j]
      }
      const newCentroids = []
      for (let c = 0; c < k; c++) {
        if (counts[c] === 0) {
          // Reseed empty cluster from the most-distant point under the
          // current assignment (avoids a permanent dead cluster).
          let farIdx = 0, farD = -1
          for (let i = 0; i < X.length; i++) {
            const d = _euclidSq(X[i], centroids[labels[i]])
            if (d > farD) { farD = d; farIdx = i }
          }
          newCentroids.push(X[farIdx].slice())
        } else {
          newCentroids.push(sums[c].map(v => v / counts[c]))
        }
      }
      centroids = newCentroids

      if (Math.abs(prevInertia - inertia) < tol) {
        converged = true
        prevInertia = inertia
        break
      }
      prevInertia = inertia
    }

    if (!best || prevInertia < best.inertia) {
      best = { labels: labels.slice(), centroids, inertia: prevInertia, converged, iterations: iter + 1 }
    }
  }

  return best
}

/**
 * Mean silhouette coefficient over all points. For point i:
 *   a(i) = mean intra-cluster distance
 *   b(i) = mean nearest-other-cluster distance
 *   s(i) = (b - a) / max(a, b)
 * Score is the average of s(i). Range [-1, 1]; higher is better.
 *
 * Use this to pick k by sweeping and picking the k with the highest score.
 *
 * @param {number[][]} X      — n × d feature matrix (standardized if needed)
 * @param {number[]}   labels — cluster assignment per point
 * @returns {number} mean silhouette score
 */
export function silhouetteScore(X, labels) {
  const n = X.length
  if (n < 2) return 0
  // Group point indices by cluster up-front so the inner loop is O(cluster size).
  const byCluster = new Map()
  for (let i = 0; i < n; i++) {
    const c = labels[i]
    if (!byCluster.has(c)) byCluster.set(c, [])
    byCluster.get(c).push(i)
  }
  if (byCluster.size < 2) return 0

  let total = 0
  let counted = 0
  for (let i = 0; i < n; i++) {
    const own = labels[i]
    const ownIdx = byCluster.get(own)
    if (ownIdx.length < 2) continue   // singletons get s=0 by convention
    let aSum = 0
    for (const j of ownIdx) if (j !== i) aSum += Math.sqrt(_euclidSq(X[i], X[j]))
    const a = aSum / (ownIdx.length - 1)

    let b = Infinity
    for (const [c, idxs] of byCluster) {
      if (c === own) continue
      let s = 0
      for (const j of idxs) s += Math.sqrt(_euclidSq(X[i], X[j]))
      const meanD = s / idxs.length
      if (meanD < b) b = meanD
    }

    const denom = Math.max(a, b)
    total += denom > 0 ? (b - a) / denom : 0
    counted++
  }

  return counted ? total / counted : 0
}

/**
 * Convenience: sweep k over a range, run kmeans for each, return the
 * silhouette-best one. Useful when the right cluster count isn't obvious.
 *
 * @param {number[][]} X
 * @param {number[]}   ks         — candidate k values, e.g. [3, 4, 5]
 * @param {object}     [opts]     — passed through to kmeans
 * @returns {{ k: number, labels: number[], centroids: number[][], silhouette: number, scoresByK: Record<number, number> }}
 */
export function pickKBySilhouette(X, ks, opts = {}) {
  let best = null
  const scoresByK = {}
  for (const k of ks) {
    const fit = kmeans(X, k, opts)
    const sil = silhouetteScore(X, fit.labels)
    scoresByK[k] = +sil.toFixed(4)
    if (!best || sil > best.silhouette) {
      best = { k, labels: fit.labels, centroids: fit.centroids, silhouette: sil }
    }
  }
  return { ...best, scoresByK }
}
