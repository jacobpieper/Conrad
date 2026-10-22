import { RendererError } from './types'
import type { GrayscaleImage, ImageState, RendererState, Viewport } from './types'
import { rendererShader } from './shader'

const bytesPerPixel = 4
const bytesPerRowAlignment = 256
const background = 16 / 255

function alignedBytesPerRow(width: number): number {
  const bytesPerRow = width * bytesPerPixel
  return Math.ceil(bytesPerRow / bytesPerRowAlignment) * bytesPerRowAlignment
}

function validateViewport(device: GPUDevice, width: number, height: number): void {
  const maxDimension = device.limits.maxTextureDimension2D
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > maxDimension ||
    height > maxDimension
  ) {
    throw new RendererError(
      'invalid-viewport',
      `Viewport dimensions must be positive integers no greater than ${maxDimension}`
    )
  }
}

function createSurfaceResources(
  device: GPUDevice,
  width: number,
  height: number
): { surface: GPUTexture; surfaceView: GPUTextureView; readbackBuffer: GPUBuffer } {
  const surface = device.createTexture({
    size: { width, height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  })
  const surfaceView = surface.createView()
  const readbackBuffer = device.createBuffer({
    size: alignedBytesPerRow(width) * height,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  return { surface, surfaceView, readbackBuffer }
}

function render(state: RendererState): void {
  const encoder = state.device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: state.surfaceView,
        clearValue: { r: background, g: background, b: background, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }
    ]
  })
  if (state.image !== null) {
    pass.setPipeline(state.pipeline)
    pass.setBindGroup(0, state.image.bindGroup)
    pass.draw(3)
  }
  pass.end()
  state.device.queue.submit([encoder.finish()])
}

function validateImage(state: RendererState, image: GrayscaleImage): void {
  const maxDimension = state.device.limits.maxTextureDimension2D
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.width > maxDimension ||
    image.height > maxDimension ||
    image.data.length !== image.width * image.height
  ) {
    throw new RendererError(
      'invalid-image',
      `Image dimensions must be positive integers no greater than ${maxDimension} and data length must equal width * height`
    )
  }
}

function createImageState(
  state: RendererState,
  image: GrayscaleImage,
  texture: GPUTexture
): ImageState {
  const view = texture.createView()
  const bindGroup = state.device.createBindGroup({
    layout: state.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: state.sampler },
      { binding: 2, resource: view }
    ]
  })

  return { width: image.width, height: image.height, texture, bindGroup }
}

export async function createRenderer(width: number, height: number): Promise<RendererState> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RendererError('invalid-viewport', 'Viewport dimensions must be positive integers')
  }

  let adapter: GPUAdapter | null
  try {
    adapter = await navigator.gpu.requestAdapter()
  } catch (cause) {
    throw new RendererError('webgpu-unavailable', 'Unable to request a WebGPU adapter', cause)
  }
  if (adapter === null) {
    throw new RendererError('webgpu-unavailable', 'No WebGPU adapter is available')
  }

  let device: GPUDevice
  try {
    device = await adapter.requestDevice()
  } catch (cause) {
    throw new RendererError('webgpu-unavailable', 'Unable to request a WebGPU device', cause)
  }

  try {
    validateViewport(device, width, height)
  } catch (error) {
    device.destroy()
    throw error
  }

  const shaderModule = device.createShaderModule({ code: rendererShader })
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' }
      }
    ]
  })
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })

  let pipeline: GPURenderPipeline
  try {
    pipeline = await device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vertexMain' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: { topology: 'triangle-list' }
    })
  } catch (cause) {
    device.destroy()
    throw new RendererError('webgpu-unavailable', 'Unable to create the WebGPU render pipeline', cause)
  }

  const sampler = device.createSampler({
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear'
  })
  const uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })
  const uniformScratch = new Float32Array([width, height])
  device.queue.writeBuffer(uniformBuffer, 0, uniformScratch)
  const surfaceResources = createSurfaceResources(device, width, height)
  const state: RendererState = {
    device,
    pipeline,
    bindGroupLayout,
    sampler,
    uniformBuffer,
    uniformScratch,
    viewport: { width, height },
    ...surfaceResources,
    image: null,
    target: null
  }

  render(state)
  return state
}

export function destroyRenderer(state: RendererState): void {
  state.image?.texture.destroy()
  state.surface.destroy()
  state.readbackBuffer.destroy()
  state.uniformBuffer.destroy()
  state.device.destroy()
}

export function updateBuffer(state: RendererState, image: GrayscaleImage): void {
  validateImage(state, image)

  const previousImage = state.image
  const reuseTexture =
    previousImage !== null &&
    previousImage.width === image.width &&
    previousImage.height === image.height
  const texture = reuseTexture
    ? previousImage.texture
    : state.device.createTexture({
        size: { width: image.width, height: image.height },
        format: 'r8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      })

  state.device.queue.writeTexture(
    { texture },
    image.data,
    { bytesPerRow: image.width, rowsPerImage: image.height },
    { width: image.width, height: image.height }
  )

  const nextImage = reuseTexture
    ? { ...previousImage, width: image.width, height: image.height }
    : createImageState(state, image, texture)
  state.image = nextImage
  if (!reuseTexture) previousImage?.texture.destroy()
  render(state)
}

export async function readSurface(state: RendererState, out: Uint8Array): Promise<void> {
  const { width, height } = state.viewport
  const expectedLength = width * height * bytesPerPixel
  if (out.length !== expectedLength) {
    throw new RendererError('invalid-output', `Output buffer length must equal ${expectedLength}`)
  }

  const bytesPerRow = alignedBytesPerRow(width)
  const encoder = state.device.createCommandEncoder()
  encoder.copyTextureToBuffer(
    { texture: state.surface },
    { buffer: state.readbackBuffer, bytesPerRow, rowsPerImage: height },
    { width, height }
  )
  state.device.queue.submit([encoder.finish()])
  await state.readbackBuffer.mapAsync(GPUMapMode.READ)

  const mapped = new Uint8Array(state.readbackBuffer.getMappedRange())
  for (let y = 0; y < height; y++) {
    const sourceRow = y * bytesPerRow
    const destinationRow = y * width * bytesPerPixel
    for (let x = 0; x < width * bytesPerPixel; x++) {
      out[destinationRow + x] = mapped[sourceRow + x] ?? 0
    }
  }
  state.readbackBuffer.unmap()
}

export type { Viewport }