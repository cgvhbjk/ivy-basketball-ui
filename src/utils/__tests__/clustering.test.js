// k-means + silhouette correctness pins. Synthetic two-cluster fixture: a
// random k-means should always recover the planted cluster structure.

import { describe, expect, it } from 'vitest'
import { zscore, kmeans, silhouetteScore, pickKBySilhouette } from '../clustering.js'

function makeBlobs(seed = 7) {
  // Two well-separated 2D blobs in raw units (no z-score needed for separation).
  const rows = []
  let a = seed >>> 0
  const r = () => {
    a = (a + 0x6D2B79F5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 30; i++) rows.push([0 + (r() - 0.5) * 0.3, 0 + (r() - 0.5) * 0.3])  // blob A near (0,0)
  for (let i = 0; i < 30; i++) rows.push([5 + (r() - 0.5) * 0.3, 5 + (r() - 0.5) * 0.3])  // blob B near (5,5)
  return rows
}

describe('zscore', () => {
  it('standardizes to mean ≈ 0, sd ≈ 1 per column', () => {
    const { X, means, sds } = zscore([[1, 10], [2, 20], [3, 30]])
    const colMean = i => X.reduce((s, r) => s + r[i], 0) / X.length
    expect(colMean(0)).toBeCloseTo(0, 6)
    expect(colMean(1)).toBeCloseTo(0, 6)
    expect(means).toEqual([2, 20])
    expect(sds[0]).toBeCloseTo(1, 6)
  })

  it('handles a constant column without NaN explosion', () => {
    const { X } = zscore([[1, 5], [2, 5], [3, 5]])
    expect(X.every(r => Number.isFinite(r[0]) && Number.isFinite(r[1]))).toBe(true)
  })
})

describe('kmeans', () => {
  it('recovers two well-separated blobs', () => {
    const X = makeBlobs()
    const { labels } = kmeans(X, 2, { seed: 11, restarts: 5 })
    // Expect first 30 to share a label and last 30 to share a (different) label.
    const labelA = labels[0]
    const labelB = labels[59]
    expect(labelA).not.toBe(labelB)
    for (let i = 0; i < 30;  i++) expect(labels[i]).toBe(labelA)
    for (let i = 30; i < 60; i++) expect(labels[i]).toBe(labelB)
  })

  it('is reproducible at the same seed', () => {
    const X = makeBlobs()
    const a = kmeans(X, 2, { seed: 42, restarts: 3 })
    const b = kmeans(X, 2, { seed: 42, restarts: 3 })
    expect(a.labels).toEqual(b.labels)
    expect(a.inertia).toBeCloseTo(b.inertia, 8)
  })

  it('throws when n < k', () => {
    expect(() => kmeans([[1, 2], [3, 4]], 4)).toThrow(/n=2/)
  })
})

describe('silhouetteScore', () => {
  it('approaches 1 for well-separated clusters', () => {
    const X = makeBlobs()
    const { labels } = kmeans(X, 2, { seed: 11 })
    const s = silhouetteScore(X, labels)
    expect(s).toBeGreaterThan(0.85)
  })

  it('is near 0 for random labels on tight, single-blob data', () => {
    // 60 points in one tight cloud, with random labels — silhouette should hover near 0.
    const X = []
    let a = 13
    const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 }
    for (let i = 0; i < 60; i++) X.push([r() * 0.1, r() * 0.1])
    const labels = X.map((_, i) => i % 2)
    const s = silhouetteScore(X, labels)
    expect(s).toBeGreaterThan(-0.2)
    expect(s).toBeLessThan(0.2)
  })
})

describe('pickKBySilhouette', () => {
  it('picks k=2 over k=3,4 on a two-blob fixture', () => {
    const X = makeBlobs()
    const result = pickKBySilhouette(X, [2, 3, 4], { seed: 7, restarts: 3 })
    expect(result.k).toBe(2)
    expect(result.scoresByK[2]).toBeGreaterThan(result.scoresByK[3])
  })
})
