import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.{test,bench}.ts'],
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
