import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    include: ['tests/unit/simulation-orchestrator/tick.bench.ts'],
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
