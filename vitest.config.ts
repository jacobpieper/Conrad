import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { mouseDown, mouseMove, mouseUp } from './tests/setup/mouse-command.ts'

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  test: {
    include: ['tests/unit/**/*.{test,bench}.ts'],
    exclude: ['tests/unit/simulation-orchestrator/tick.bench.ts'],
    globalSetup: ['tests/setup/cross-origin-server.ts'],
    browser: {
      enabled: true,
      commands: { mouseMove, mouseDown, mouseUp },
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
