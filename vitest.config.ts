import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  test: {
    include: ['tests/unit/**/*.{test,bench}.ts'],
    exclude: ['tests/unit/simulation-orchestrator/tick.bench.ts'],
    globalSetup: ['tests/setup/cross-origin-server.ts'],
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
