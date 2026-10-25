import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  test: {
    include: ['tests/unit/viewport/render.bench.ts'],
    globalSetup: ['tests/setup/cross-origin-server.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: ['--enable-precise-memory-info']
        }
      }),
      headless: true,
      instances: [{ browser: 'chromium' }]
    }
  }
})
