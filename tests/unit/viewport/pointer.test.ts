import { afterEach, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import type { PointerPayload } from '../../../src/lib/viewport'
import { mountViewport, nextFrame } from './helpers'

describe('Viewport primary pointer routing', () => {
  let cleanup: (() => void) | undefined

  afterEach(async () => {
    await commands.mouseUp('left')
    cleanup?.()
    cleanup = undefined
  })

  it('projects pointer positions using the current observed scale', async () => {
    const payloads: PointerPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onpointer: (payload) => payloads.push(payload)
    })
    cleanup = mounted.unmount
    await nextFrame()

    await moveToCanvas(mounted.canvas, 100, 50)
    expect(payloads.at(-1)).toEqual({ x: 50, y: 25, buttons: 0 })

    mounted.setContainerSize(400, 200)
    await nextFrame()
    await moveToCanvas(mounted.canvas, 100, 50)
    expect(payloads.at(-1)).toEqual({ x: 25, y: 12.5, buttons: 0 })

    await moveToCanvas(mounted.canvas, 0, 0)
    expect(payloads.at(-1)).toMatchObject({ x: 0, y: 0 })
    await moveToCanvas(mounted.canvas, 399.99, 199.99)
    expect(payloads.at(-1)?.x).toBeCloseTo(100, 2)
    expect(payloads.at(-1)?.y).toBeCloseTo(50, 2)
  })

  it('reports primary button states and captures a clamped drag outside the canvas', async () => {
    const payloads: PointerPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onpointer: (payload) => payloads.push(payload)
    })
    cleanup = mounted.unmount
    await nextFrame()
    await moveToCanvas(mounted.canvas, 50, 25)

    await commands.mouseDown('left')
    expect(payloads.at(-1)?.buttons).toBe(1)
    await commands.mouseMove(500, 500)
    expect(payloads.at(-1)?.x).toBeGreaterThanOrEqual(0)
    expect(payloads.at(-1)?.x).toBeLessThanOrEqual(100)
    expect(payloads.at(-1)?.y).toBeGreaterThanOrEqual(0)
    expect(payloads.at(-1)?.y).toBeLessThanOrEqual(50)
    await commands.mouseUp('left')
    expect(payloads.at(-1)?.buttons).toBe(0)

    for (const payload of payloads) {
      expect(Object.keys(payload).sort()).toEqual(['buttons', 'x', 'y'])
      expect(typeof payload.x).toBe('number')
      expect(typeof payload.y).toBe('number')
      expect(typeof payload.buttons).toBe('number')
    }
    expect(payloads[0]).not.toBe(payloads[1])
  })

  it('does not dispatch pointer payloads when the canvas has zero size', async () => {
    const payloads: PointerPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onpointer: (payload) => payloads.push(payload)
    })
    cleanup = mounted.unmount
    await nextFrame()
    mounted.setContainerSize(0, 100)
    await nextFrame()
    payloads.length = 0

    await commands.mouseMove(10, 10)

    expect(payloads).toHaveLength(0)
  })
})

async function moveToCanvas(canvas: HTMLCanvasElement, offsetX: number, offsetY: number): Promise<void> {
  const bounds = canvas.getBoundingClientRect()
  await commands.mouseMove(bounds.left + offsetX, bounds.top + offsetY)
}
