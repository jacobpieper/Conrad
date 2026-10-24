import { RendererError } from './types'
import type { GrayscaleImage, ImageState, RendererState, Viewport } from './types'

const bytesPerPixel = 4
const background = 'rgb(16, 16, 16)'
const opaqueBlack = 0xff000000

function validateViewport(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RendererError('invalid-viewport', 'Viewport dimensions must be positive integers')
  }
}

function validateImage(image: GrayscaleImage): void {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.data.length !== image.width * image.height
  ) {
    throw new RendererError(
      'invalid-image',
      'Image dimensions must be positive integers and data length must equal width * height'
    )
  }
}

function render(state: RendererState): void {
  const { width, height } = state.viewport
  const context = state.surfaceContext
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const image = state.image
  if (image !== null) {
    const scale = Math.min(width / image.width, height / image.height)
    const displayWidth = Math.max(1, Math.round(image.width * scale))
    const displayHeight = Math.max(1, Math.round(image.height * scale))
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      image.staging,
      Math.floor((width - displayWidth) / 2),
      Math.floor((height - displayHeight) / 2),
      displayWidth,
      displayHeight
    )
  }

  state.target?.context.drawImage(state.surface, 0, 0)
}

function createImageState(image: GrayscaleImage): ImageState {
  const staging = new OffscreenCanvas(image.width, image.height)
  const stagingContext = staging.getContext('2d')
  if (stagingContext === null) {
    throw new RendererError('canvas-unavailable', 'Unable to get a 2D context for the staging canvas')
  }
  const pixels = stagingContext.createImageData(image.width, image.height)
  return {
    width: image.width,
    height: image.height,
    staging,
    stagingContext,
    pixels,
    pixels32: new Uint32Array(pixels.data.buffer)
  }
}

export async function createRenderer(width: number, height: number): Promise<RendererState> {
  validateViewport(width, height)

  const surface = new OffscreenCanvas(width, height)
  const surfaceContext = surface.getContext('2d', { alpha: false })
  if (surfaceContext === null) {
    throw new RendererError('canvas-unavailable', 'Unable to get a 2D context for the surface')
  }

  const state: RendererState = {
    viewport: { width, height },
    surface,
    surfaceContext,
    image: null,
    target: null
  }
  render(state)
  return state
}

export function destroyRenderer(state: RendererState): void {
  state.target = null
  if (state.image !== null) {
    state.image.staging.width = 0
    state.image = null
  }
  state.surface.width = 0
}

export function resize(state: RendererState, width: number, height: number): void {
  validateViewport(width, height)
  if (state.viewport.width === width && state.viewport.height === height) return

  state.viewport.width = width
  state.viewport.height = height
  state.surface.width = width
  state.surface.height = height
  if (state.target !== null) {
    state.target.canvas.width = width
    state.target.canvas.height = height
  }
  render(state)
}

type Context2DSource = {
  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
}

export function bindTarget(
  state: RendererState,
  canvas: HTMLCanvasElement | OffscreenCanvas
): void {
  // The DOM union's getContext overloads collapse to a generic type; this narrows to the 2d overloads.
  const source: Context2DSource = canvas
  const context = source.getContext('2d', { alpha: false })
  if (context === null) {
    throw new RendererError('canvas-unavailable', 'Unable to get a 2D canvas context')
  }

  canvas.width = state.viewport.width
  canvas.height = state.viewport.height
  state.target = { canvas, context }
  render(state)
}

export function unbindTarget(state: RendererState): void {
  state.target = null
}

export function updateBuffer(state: RendererState, image: GrayscaleImage): void {
  validateImage(image)

  const previous = state.image
  const next =
    previous !== null && previous.width === image.width && previous.height === image.height
      ? previous
      : createImageState(image)

  const source = image.data
  const target = next.pixels32
  for (let index = 0; index < target.length; index++) {
    target[index] = opaqueBlack | ((source[index] ?? 0) * 0x010101)
  }
  next.stagingContext.putImageData(next.pixels, 0, 0)

  if (next !== previous) {
    if (previous !== null) previous.staging.width = 0
    state.image = next
  }
  render(state)
}

export async function readSurface(state: RendererState, out: Uint8Array): Promise<void> {
  const { width, height } = state.viewport
  const expectedLength = width * height * bytesPerPixel
  if (out.length !== expectedLength) {
    throw new RendererError('invalid-output', `Output buffer length must equal ${expectedLength}`)
  }

  out.set(state.surfaceContext.getImageData(0, 0, width, height).data)
}

export type { Viewport }
