<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { expandGrayscale } from './expand'
  import { ViewportError } from './types'
  import type { GrayscaleImage, PointerPayload, WindowPayload } from './types'

  type Props = {
    width: number
    height: number
    onpointer?: (payload: PointerPayload) => void
    onwindow?: (payload: WindowPayload) => void
  }

  let { width, height, onpointer, onwindow }: Props = $props()
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D | undefined
  let image: ImageData | undefined
  let pixels32: Uint32Array | undefined

  untrack(() => validateGrid(width, height))

  function validateGrid(gridWidth: number, gridHeight: number): void {
    if (
      !Number.isInteger(gridWidth) ||
      gridWidth <= 0 ||
      !Number.isInteger(gridHeight) ||
      gridHeight <= 0
    ) {
      throw new ViewportError('invalid-grid', 'width and height must be positive integers')
    }
  }

  onMount(() => {
    canvas.width = width
    canvas.height = height

    const nextContext = canvas.getContext('2d', { alpha: false })
    if (nextContext === null) {
      throw new ViewportError('canvas-unavailable', 'Unable to get a 2D context for the viewport')
    }

    nextContext.imageSmoothingEnabled = false
    context = nextContext
    image = context.createImageData(width, height)
    pixels32 = new Uint32Array(image.data.buffer)
  })

  export function render(frame: GrayscaleImage): void {
    if (frame.width !== width || frame.height !== height || frame.data.length !== width * height) {
      throw new ViewportError('invalid-frame', 'frame dimensions and data length must match the viewport grid')
    }
    if (context === undefined || image === undefined || pixels32 === undefined) {
      throw new ViewportError('canvas-unavailable', 'Viewport canvas has not been initialized')
    }

    expandGrayscale(frame.data, pixels32)
    context.putImageData(image, 0, 0)
  }
</script>

<div class="viewport">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  canvas {
    display: block;
    flex: none;
    image-rendering: pixelated;
    touch-action: none;
  }
</style>
