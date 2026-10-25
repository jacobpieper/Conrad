import { describe, expect, it } from 'vitest'
import { fitScale, toGrid } from '../../../src/lib/viewport/projection'

describe('fitScale', () => {
  it('fits the grid uniformly within the container', () => {
    expect(fitScale(100, 100, 4, 2)).toBe(25)
    expect(fitScale(40, 100, 4, 2)).toBe(10)
    expect(fitScale(200, 100, 100, 50)).toBe(2)
    expect(fitScale(400, 200, 100, 50)).toBe(4)
  })

  it('uses the more constrained container dimension', () => {
    expect(fitScale(100, 20, 4, 2)).toBe(10)
    expect(fitScale(20, 100, 4, 2)).toBe(5)
  })

  it('supports exact and fractional fits below native size', () => {
    expect(fitScale(40, 20, 4, 2)).toBe(10)
    expect(fitScale(2, 2, 4, 4)).toBe(0.5)
  })

  it('returns zero when either container extent is zero', () => {
    expect(fitScale(0, 100, 4, 2)).toBe(0)
    expect(fitScale(100, 0, 4, 2)).toBe(0)
  })
})

describe('toGrid', () => {
  it('projects CSS offsets to continuous grid coordinates', () => {
    expect(toGrid(100, 200, 100)).toBe(50)
    expect(toGrid(0, 200, 100)).toBe(0)
    expect(toGrid(200, 200, 100)).toBe(100)
    expect(toGrid(100, 400, 100)).toBe(25)
    expect(toGrid(50, 400, 100)).toBe(12.5)
  })

  it('clamps offsets to the grid extent', () => {
    expect(toGrid(-5, 200, 100)).toBe(0)
    expect(toGrid(250, 200, 100)).toBe(100)
  })

  it('returns deterministic values for identical inputs', () => {
    expect(toGrid(73, 260, 100)).toBe(toGrid(73, 260, 100))
  })
})
