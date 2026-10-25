import { afterEach, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'

type PointerSample = {
  type: string
  clientX: number
  clientY: number
  button: number
  buttons: number
}

describe('real mouse browser commands', () => {
  let target: HTMLDivElement | undefined

  afterEach(() => {
    target?.remove()
    target = undefined
  })

  it('moves and presses/releases the middle button at iframe-relative coordinates', async () => {
    const samples: PointerSample[] = []
    function recordPointer(event: PointerEvent): void {
      samples.push({
        type: event.type,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons
      })
    }

    target = document.createElement('div')
    target.style.position = 'fixed'
    target.style.left = '0'
    target.style.top = '0'
    target.style.width = '200px'
    target.style.height = '200px'
    target.addEventListener('pointerdown', recordPointer)
    target.addEventListener('pointermove', recordPointer)
    target.addEventListener('pointerup', recordPointer)
    document.body.append(target)

    await commands.mouseMove(50, 40)
    samples.length = 0
    await commands.mouseDown('middle')
    await commands.mouseUp('middle')

    expect(samples).toEqual([
      { type: 'pointerdown', clientX: 50, clientY: 40, button: 1, buttons: 4 },
      { type: 'pointerup', clientX: 50, clientY: 40, button: 1, buttons: 0 }
    ])
  })
})
