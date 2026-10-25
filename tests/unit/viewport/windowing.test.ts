import { afterEach, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import type { PointerPayload, WindowPayload } from '../../../src/lib/viewport'
import { canvasOrigin, mountViewport, nextFrame } from './helpers'

describe('Viewport middle-button windowing route', () => {
  let cleanup: (() => void) | undefined

  afterEach(async () => {
    await commands.mouseUp('middle')
    await commands.mouseUp('left')
    cleanup?.()
    cleanup = undefined
  })

  it('routes middle drags exclusively with grid-space deltas and suppresses defaults', async () => {
    const pointerPayloads: PointerPayload[] = []
    const windowPayloads: WindowPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onpointer: (payload) => pointerPayloads.push(payload),
      onwindow: (payload) => windowPayloads.push(payload)
    })
    cleanup = mounted.unmount
    const defaultPrevented: boolean[] = []
    mounted.container.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button === 1) defaultPrevented.push(event.defaultPrevented)
    })
    await nextFrame()

    await moveToCanvas(mounted.canvas, 20, 20)
    const pointerCountBeforeDrag = pointerPayloads.length
    await commands.mouseDown('middle')
    expect(pointerPayloads).toHaveLength(pointerCountBeforeDrag)
    expect(defaultPrevented).toEqual([true])

    await moveToCanvas(mounted.canvas, 40, 30)
    await moveToCanvas(mounted.canvas, 40, 50)
    expect(windowPayloads).toEqual([
      { x: 20, y: 15, dx: 10, dy: 5 },
      { x: 20, y: 25, dx: 0, dy: 10 }
    ])
    expect(pointerPayloads).toHaveLength(pointerCountBeforeDrag)

    await moveToCanvas(mounted.canvas, 60, 50)
    mounted.setContainerSize(400, 200)
    await nextFrame()
    await moveToCanvas(mounted.canvas, 80, 70)
    expect(windowPayloads.at(-1)).toEqual({ x: 20, y: 17.5, dx: -10, dy: -7.5 })

    await commands.mouseUp('middle')
    const pointerCountAfterRelease = pointerPayloads.length
    const windowCountAfterRelease = windowPayloads.length
    await moveToCanvas(mounted.canvas, 100, 100)
    expect(pointerPayloads.length).toBe(pointerCountAfterRelease + 1)
    expect(windowPayloads).toHaveLength(windowCountAfterRelease)
  })

  it('continues a middle drag outside the canvas with clamped numeric payloads', async () => {
    const windowPayloads: WindowPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onwindow: (payload) => windowPayloads.push(payload)
    })
    cleanup = mounted.unmount
    await nextFrame()
    await moveToCanvas(mounted.canvas, 20, 20)
    await commands.mouseDown('middle')
    await commands.mouseMove(500, 500)

    const payload = windowPayloads.at(-1)
    expect(payload).toBeDefined()
    expect(payload?.x).toBe(100)
    expect(payload?.y).toBe(50)
    expect(Object.keys(payload ?? {}).sort()).toEqual(['dx', 'dy', 'x', 'y'])
    expect(typeof payload?.dx).toBe('number')
    expect(typeof payload?.dy).toBe('number')
  })

  it('keeps primary-button drags on the pointer route', async () => {
    const pointerPayloads: PointerPayload[] = []
    const windowPayloads: WindowPayload[] = []
    const mounted = mountViewport({
      width: 100,
      height: 50,
      containerWidth: 200,
      containerHeight: 100,
      onpointer: (payload) => pointerPayloads.push(payload),
      onwindow: (payload) => windowPayloads.push(payload)
    })
    cleanup = mounted.unmount
    await nextFrame()
    await moveToCanvas(mounted.canvas, 20, 20)
    await commands.mouseDown('left')
    await moveToCanvas(mounted.canvas, 40, 30)
    await commands.mouseUp('left')

    expect(pointerPayloads.length).toBeGreaterThan(1)
    expect(windowPayloads).toHaveLength(0)
  })
})

async function moveToCanvas(canvas: HTMLCanvasElement, offsetX: number, offsetY: number): Promise<void> {
  const origin = canvasOrigin(canvas)
  await commands.mouseMove(origin.left + offsetX, origin.top + offsetY)
}
