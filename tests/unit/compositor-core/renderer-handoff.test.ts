import { afterEach, describe, expect, it } from 'vitest'
import { compose, createCompositor, registerLayer } from '../../../src/core/compositor-core'
import { createRenderer, destroyRenderer, readSurface, updateBuffer } from '../../../src/core/headless-renderer'
import type { RendererState } from '../../../src/core/headless-renderer'

describe('compositor to renderer hand-off', () => {
  let renderer: RendererState | undefined

  afterEach(() => {
    if (renderer !== undefined) destroyRenderer(renderer)
    renderer = undefined
  })

  it('passes the composed image to updateBuffer and reads it back unchanged', async () => {
    const width = 4
    const height = 3
    const state = createCompositor(width, height, 2)
    registerLayer(state, Uint8Array.from({ length: 12 }, (_, index) => index * 10), 0.5)
    registerLayer(state, Uint8Array.from({ length: 12 }, (_, index) => 100 + index), 1)

    const image = compose(state)
    renderer = await createRenderer(width, height)
    updateBuffer(renderer, image)
    const pixels = new Uint8Array(width * height * 4)
    await readSurface(renderer, pixels)

    for (let index = 0; index < image.data.length; index++) {
      const offset = index * 4
      expect(pixels[offset]).toBe(image.data[index])
      expect(pixels[offset + 1]).toBe(image.data[index])
      expect(pixels[offset + 2]).toBe(image.data[index])
      expect(pixels[offset + 3]).toBe(255)
    }
  })
})
