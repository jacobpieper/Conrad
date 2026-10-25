/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

const coreSources = import.meta.glob('/src/core/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const viewportSources = import.meta.glob('/src/lib/viewport/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

describe('viewport architecture boundary', () => {
  it('keeps core imports independent of Svelte and the viewport UI', () => {
    const files = Object.entries(coreSources)
    expect(files.length).toBeGreaterThan(0)

    for (const [path, source] of files) {
      expect(source, path).not.toMatch(/(?:from\s*|import\s*\()\s*['"](?:svelte|\$lib|@sveltejs|[^'"]*\/lib\/viewport|[^'"]*src\/lib)/)
    }
  })

  it('keeps DOM types out of public type files and pure helpers', () => {
    const types = viewportSources['/src/lib/viewport/types.ts']
    const index = viewportSources['/src/lib/viewport/index.ts']
    const projection = viewportSources['/src/lib/viewport/projection.ts']
    const expand = viewportSources['/src/lib/viewport/expand.ts']

    expect(types).toBeDefined()
    expect(index).toBeDefined()
    expect(projection).toBeDefined()
    expect(expand).toBeDefined()
    expect(types).not.toMatch(/\b(?:Event|MouseEvent|PointerEvent|HTMLElement)\b/)
    expect(index).not.toMatch(/\b(?:Event|MouseEvent|PointerEvent|HTMLElement)\b/)
    expect(projection).not.toMatch(/\b(?:document|window)\b|from\s*['"]svelte/)
    expect(expand).not.toMatch(/\b(?:document|window)\b|from\s*['"]svelte/)
  })

  it('uses only scoped vanilla CSS in the Svelte component', () => {
    const component = viewportSources['/src/lib/viewport/Viewport.svelte']

    expect(component).toBeDefined()
    expect(component?.match(/<style(?:\s[^>]*)?>/g)).toHaveLength(1)
    expect(component).toContain('image-rendering: pixelated')
    expect(component).not.toMatch(/<style\s+lang\s*=|@import\b|@apply\b/)
  })
})
