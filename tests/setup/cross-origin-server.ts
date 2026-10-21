import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { TestProject } from 'vitest/node'
import { TEST_PNG_DATA_URI } from '../unit/image-loader/fixtures'

declare module 'vitest' {
  export interface ProvidedContext {
    crossOriginBaseUrl: string
  }
}

const png = Buffer.from(TEST_PNG_DATA_URI.split(',')[1] as string, 'base64')

// Serves the same PNG from a second origin: /open.png allows CORS, /blocked.png does not,
// and /truncated.png advertises the full length then drops the connection mid-body.
export default async function setup(project: TestProject) {
  const server = createServer((req, res) => {
    if (req.url === '/truncated.png') {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        'Access-Control-Allow-Origin': '*'
      })
      res.write(png.subarray(0, 8), () => res.socket?.destroy())
      return
    }
    const headers: Record<string, string> = { 'Content-Type': 'image/png' }
    if (req.url === '/open.png') headers['Access-Control-Allow-Origin'] = '*'
    res.writeHead(200, headers)
    res.end(png)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  project.provide('crossOriginBaseUrl', `http://127.0.0.1:${port}`)

  return () => new Promise<void>((resolve) => server.close(() => resolve()))
}
