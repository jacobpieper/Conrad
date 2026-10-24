import { afterEach, describe, expect, it } from 'vitest'
import { compose, createCompositor, registerLayer } from '../../../src/core/compositor-core'
import { createRenderer, destroyRenderer, readSurface, updateBuffer } from '../../../src/core/headless-renderer'
import type { RendererState } from '../../../src/core/headless-renderer'
import { createNoiseController, processFrame } from '../../../src/core/noise-controller'

function setup() {
  const compositor = createCompositor(4, 1, 2)
  const first = Uint8Array.from([0, 50, 100, 100])
  const second = Uint8ClampedArray.from([0, 25, 0, 50])
  registerLayer(compositor, first, 1)
  registerLayer(compositor, second, 1)
  return { compositor, first, second }
}

describe('noise controller with compositor and renderer', () => {
  let renderer: RendererState | undefined

  afterEach(() => {
    if (renderer !== undefined) destroyRenderer(renderer)
    renderer = undefined
  })

  it('applies window/level to the composed frame without changing any source', () => {
    const { compositor, first, second } = setup()
    const noise = createNoiseController(4, 1, { window: 100, level: 100 })

    const composed = compose(compositor)
    const composedBefore = Array.from(composed.data)
    expect(composedBefore).toEqual([0, 75, 100, 150])

    const processed = processFrame(noise, composed)
    const again = Array.from(processFrame(noise, composed).data)

    expect(Array.from(processed.data)).toEqual([0, 64, 128, 255])
    expect(again).toEqual([0, 64, 128, 255])
    expect(processed).not.toBe(composed)
    expect(Array.from(composed.data)).toEqual(composedBefore)
    expect(compositor.layers[0]).toBe(first)
    expect(compositor.layers[1]).toBe(second)
    expect(Array.from(first)).toEqual([0, 50, 100, 100])
    expect(Array.from(second)).toEqual([0, 25, 0, 50])
  })

  it('adds noise without touching the sources and hands the result to the renderer', async () => {
    const { compositor, first, second } = setup()
    const clean = createNoiseController(4, 1, { window: 100, level: 100 })
    const noise = createNoiseController(4, 1, { window: 100, level: 100, dose: 500, seed: 2024 })

    const composed = compose(compositor)
    const composedBefore = Array.from(composed.data)
    const expected = Array.from(processFrame(clean, composed).data)
    const processed = processFrame(noise, composed)

    expect(Array.from(processed.data)).not.toEqual(expected)
    expect(Array.from(composed.data)).toEqual(composedBefore)
    expect(Array.from(first)).toEqual([0, 50, 100, 100])
    expect(Array.from(second)).toEqual([0, 25, 0, 50])

    renderer = await createRenderer(4, 1)
    updateBuffer(renderer, processed)
    const pixels = new Uint8Array(4 * 4)
    await readSurface(renderer, pixels)

    for (let index = 0; index < 4; index++) {
      const offset = index * 4
      expect(pixels[offset]).toBe(processed.data[index])
      expect(pixels[offset + 1]).toBe(processed.data[index])
      expect(pixels[offset + 2]).toBe(processed.data[index])
      expect(pixels[offset + 3]).toBe(255)
    }
  })
})
