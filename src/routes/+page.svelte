<script lang="ts">
  import { onMount } from 'svelte'
  import { Viewport } from '#lib/viewport'
  import type { GrayscaleImage, PointerPayload, WindowPayload } from '#lib/viewport'

  let viewport: { render: (frame: GrayscaleImage) => void }
  let pointer = $state<PointerPayload | undefined>()
  let windowing = $state<WindowPayload | undefined>()

  const data = new Uint8ClampedArray(64 * 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      data[y * 64 + x] = (x * 4) & 255
    }
  }
  const frame: GrayscaleImage = { width: 64, height: 64, data }

  onMount(() => viewport.render(frame))
</script>

<main>
  <header>
    <h1>Viewport Canvas</h1>
    <div class="readouts" aria-live="polite">
      <output>Pointer: {pointer === undefined ? 'idle' : `${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)} · ${pointer.buttons}`}</output>
      <output>Window: {windowing === undefined ? 'idle' : `${windowing.dx.toFixed(2)}, ${windowing.dy.toFixed(2)}`}</output>
    </div>
  </header>
  <div class="stage">
    <Viewport
      width={64}
      height={64}
      bind:this={viewport}
      onpointer={(payload) => (pointer = payload)}
      onwindow={(payload) => (windowing = payload)}
    />
  </div>
</main>

<style>
  main {
    box-sizing: border-box;
    min-height: 100vh;
    padding: 24px;
    color: #f2f0e9;
    background: #101010;
    font-family: 'IBM Plex Mono', monospace;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto 20px;
    max-width: 1100px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 500;
  }

  .readouts {
    display: flex;
    gap: 20px;
    color: #d2d0c9;
    font-size: 12px;
  }

  output {
    white-space: nowrap;
  }

  .stage {
    width: 80vw;
    height: 80vh;
    min-height: 240px;
    margin: 0 auto;
    outline: 1px solid #686a62;
    background: #090a08;
  }

  @media (max-width: 700px) {
    main {
      padding: 16px;
    }

    header {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }

    .readouts {
      flex-direction: column;
      gap: 6px;
    }

    .stage {
      width: 100%;
      height: 70vh;
      min-height: 220px;
    }
  }
</style>
