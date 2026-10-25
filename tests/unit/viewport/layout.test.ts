import { afterEach, describe, expect, it } from 'vitest'
import type { GrayscaleImage } from '../../../src/lib/viewport'
import { mountViewport, nextFrame } from './helpers'

describe('Viewport layout', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('fits to container changes without resizing the backing store or clearing pixels', async () => {
    const mounted = mountViewport({ width: 4, height: 2, containerWidth: 100, containerHeight: 100 })
    cleanup = mounted.unmount
    const { container, canvas, setContainerSize } = mounted
    await nextFrame()

    expectRect(canvas, 100, 50)
    const containerBounds = container.getBoundingClientRect()
    const canvasBounds = canvas.getBoundingClientRect()
    expect(canvasBounds.left + canvasBounds.width / 2).toBeCloseTo(
      containerBounds.left + containerBounds.width / 2,
      1
    )
    expect(canvasBounds.top + canvasBounds.height / 2).toBeCloseTo(
      containerBounds.top + containerBounds.height / 2,
      1
    )

    const image: GrayscaleImage = {
      width: 4,
      height: 2,
      data: Uint8ClampedArray.from([10, 20, 30, 40, 50, 60, 70, 80])
    }
    mounted.viewport.render(image)
    const beforeResize = readPixels(canvas)

    setContainerSize(40, 100)
    await nextFrame()
    expectRect(canvas, 40, 20)
    expectBackingStore(canvas)
    expect(readPixels(canvas)).toEqual(beforeResize)

    setContainerSize(400, 200)
    await nextFrame()
    expectRect(canvas, 400, 200)
    expectBackingStore(canvas)
    expect(readPixels(canvas)).toEqual(beforeResize)

    setContainerSize(0, 100)
    await nextFrame()
    expectRect(canvas, 0, 0)
    expectBackingStore(canvas)
  })

  it('disconnects its resize observer when unmounted', async () => {
    const mounted = mountViewport({ width: 4, height: 2, containerWidth: 100, containerHeight: 100 })
    cleanup = mounted.unmount
    await nextFrame()

    mounted.unmount()
    cleanup = undefined
    expect(() => mounted.setContainerSize(40, 100)).not.toThrow()
    await nextFrame()
    expect(mounted.container.isConnected).toBe(false)
  })
})

function expectRect(canvas: HTMLCanvasElement, width: number, height: number): void {
  const bounds = canvas.getBoundingClientRect()
  expect(bounds.width).toBeCloseTo(width, 1)
  expect(bounds.height).toBeCloseTo(height, 1)
  if (width === 0 || height === 0) {
    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
    return
  }
  expect(bounds.width / bounds.height).toBeCloseTo(2, 2)
}

function expectBackingStore(canvas: HTMLCanvasElement): void {
  expect(canvas.width).toBe(4)
  expect(canvas.height).toBe(2)
}

function readPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('2D canvas context unavailable')
  return context.getImageData(0, 0, canvas.width, canvas.height).data
}
