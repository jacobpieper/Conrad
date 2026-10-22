import type { GrayscaleImage } from '../image-loader'

export type Viewport = {
  width: number
  height: number
}

export type ImageState = {
  width: number
  height: number
  texture: GPUTexture
  bindGroup: GPUBindGroup
}

export type TargetState = {
  canvas: HTMLCanvasElement | OffscreenCanvas
  context: GPUCanvasContext
}

export type RendererState = {
  device: GPUDevice
  pipeline: GPURenderPipeline
  bindGroupLayout: GPUBindGroupLayout
  sampler: GPUSampler
  uniformBuffer: GPUBuffer
  uniformScratch: Float32Array
  viewport: Viewport
  surface: GPUTexture
  surfaceView: GPUTextureView
  readbackBuffer: GPUBuffer
  image: ImageState | null
  target: TargetState | null
}

export type RendererErrorReason =
  | 'webgpu-unavailable'
  | 'invalid-image'
  | 'invalid-viewport'
  | 'invalid-output'

export class RendererError extends Error {
  readonly reason: RendererErrorReason
  override readonly cause?: unknown

  constructor(reason: RendererErrorReason, message: string, cause?: unknown) {
    super(message)
    this.name = 'RendererError'
    this.reason = reason
    if (cause !== undefined) this.cause = cause
  }
}

export type { GrayscaleImage }
