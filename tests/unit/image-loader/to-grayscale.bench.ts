import { describe, it, expect } from 'vitest'
import { toGrayscale } from '../../../src/core/image-loader/to-grayscale'

describe('toGrayscale benchmark', () => {
  it('converts a 1920x1080 buffer within a 100ms budget using one pre-sized output buffer', () => {
    const width = 1920
    const height = 1080
    const rgba = new Uint8ClampedArray(width * height * 4).fill(128)
    const out = new Uint8Array(width * height)

    const start = performance.now()
    const result = toGrayscale(rgba, width, height, out)
    const elapsed = performance.now() - start

    expect(result).toBe(out)
    expect(elapsed).toBeLessThan(100)
  })

  it('reuses the same output buffer across repeated calls with no per-call allocation', () => {
    const width = 64
    const height = 64
    const rgba = new Uint8ClampedArray(width * height * 4)
    const out = new Uint8Array(width * height)

    for (let i = 0; i < 1000; i++) {
      const result = toGrayscale(rgba, width, height, out)
      expect(result).toBe(out)
    }
  })
})
