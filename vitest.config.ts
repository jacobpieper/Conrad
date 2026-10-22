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
          args: [
            '--enable-precise-memory-info',
            '--enable-unsafe-webgpu',
            '--use-webgpu-adapter=swiftshader',
            '--use-angle=swiftshader'
          ]
        }
      }),
      headless: true,
      instances: [{ browser: 'chromium' }]
    }
  }
})
