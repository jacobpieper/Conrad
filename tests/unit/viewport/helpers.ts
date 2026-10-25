import { flushSync, mount, unmount as unmountComponent } from 'svelte'
import type { PointerPayload, WindowPayload } from '../../../src/lib/viewport'
import Viewport from '../../../src/lib/viewport/Viewport.svelte'

export type MountViewportOptions = {
  width: number
  height: number
  containerWidth: number
  containerHeight: number
  onpointer?: (payload: PointerPayload) => void
  onwindow?: (payload: WindowPayload) => void
}

export function mountViewport(options: MountViewportOptions) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.width = `${options.containerWidth}px`
  container.style.height = `${options.containerHeight}px`
  document.body.append(container)

  const props = {
    width: options.width,
    height: options.height,
    ...(options.onpointer === undefined ? {} : { onpointer: options.onpointer }),
    ...(options.onwindow === undefined ? {} : { onwindow: options.onwindow })
  }
  const viewport = mount(Viewport, { target: container, props })
  flushSync()
  const canvas = container.querySelector('canvas')
  if (canvas === null) throw new Error('Viewport did not render a canvas')

  return {
    container,
    canvas,
    viewport,
    setContainerSize(width: number, height: number) {
      container.style.width = `${width}px`
      container.style.height = `${height}px`
    },
    unmount() {
      unmountComponent(viewport)
      container.remove()
    }
  }
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function canvasOrigin(canvas: HTMLCanvasElement): { left: number; top: number } {
  const bounds = canvas.getBoundingClientRect()
  return { left: bounds.left, top: bounds.top }
}
