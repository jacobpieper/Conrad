import { describe, expect, it } from 'vitest'
import { fitScale } from '../../../src/lib/viewport/projection'

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
