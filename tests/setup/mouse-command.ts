import { defineBrowserCommand } from '@vitest/browser-playwright'

type MouseButton = 'left' | 'middle' | 'right'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    mouseMove: (x: number, y: number) => Promise<void>
    mouseDown: (button: MouseButton) => Promise<void>
    mouseUp: (button: MouseButton) => Promise<void>
  }
}

export const mouseMove = defineBrowserCommand(async ({ page, frame }, x: number, y: number) => {
  const currentFrame = await frame()
  const frameElement = await currentFrame.frameElement()
  const bounds = await frameElement.boundingBox()

  if (bounds === null) throw new Error('Vitest browser iframe has no bounding box')

  await page.mouse.move(bounds.x + x, bounds.y + y)
})

export const mouseDown = defineBrowserCommand(async ({ page }, button: MouseButton) => {
  await page.mouse.down({ button })
})

export const mouseUp = defineBrowserCommand(async ({ page }, button: MouseButton) => {
  await page.mouse.up({ button })
})
