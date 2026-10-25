import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(__dirname, '../../..')
describe('r4reach-12 home screen label + manifest', () => {
  it('index.html sets the short iOS home screen title', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8')
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="ADU Check"/)
  })
  it('manifest has id, lang and description', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
    expect(m.id).toBeTruthy(); expect(m.lang).toBe('en'); expect(m.description?.length).toBeGreaterThan(10)
  })
})
