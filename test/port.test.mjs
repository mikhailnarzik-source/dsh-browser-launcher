import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAgentBrowserVersion } from '../index.js'

test('агентский Chrome распознаётся по /json/version', () => {
  assert.equal(isAgentBrowserVersion({ Browser: 'Chrome/152.0.0.0', 'User-Agent': 'Mozilla/5.0 Chrome/152.0' }), true)
})

test('DSH/Electron на порту 9222 не считается агентом', () => {
  assert.equal(isAgentBrowserVersion({ Browser: 'Chrome/152.0.7977.130', 'User-Agent': 'Electron/44.7.0 @deepseek-ai/dsh-desktop/0.2.2-rc.5' }), false)
})

test('чужие DevTools-совместимые браузеры не считаются Chrome', () => {
  assert.equal(isAgentBrowserVersion({ Browser: 'Edg/152.0', 'User-Agent': 'Edg/152.0' }), false)
  assert.equal(isAgentBrowserVersion(null), false)
  assert.equal(isAgentBrowserVersion('Chrome/152'), false)
})
