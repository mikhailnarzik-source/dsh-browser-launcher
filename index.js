/**
 * Host-часть `dsh-browser-launcher`.
 *
 * Поднимает агентский Chrome — обычный процесс со своим каталогом профиля и
 * портом отладки — и сообщает, запущен ли он. Своей инициативы нет: два
 * маршрута, один вызов процесса. Chrome стартует не через Playwright, поэтому
 * Google не считает его автоматизированным браузером.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-browser-launcher'
export const inject = ['connection']

const START_PATH = '/api/dsh-browser-launcher/start'
const STATUS_PATH = '/api/dsh-browser-launcher/status'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const PORT = 9222
const HOME_PAGE = 'https://www.google.com/'
const START_TIMEOUT_MS = 30000
const PORTS = [9222, 9223, 9224, 9225]
const POLL_INTERVAL_MS = 400

/** Путь к Chrome: первый существующий кандидат. */
function findChrome() {
  return CHROME_CANDIDATES.find(candidate => existsSync(candidate)) ?? ''
}

/** Каталог профиля агента: он же используется ручным запуском. */
function profileDir() {
  return join(homedir(), '.dsh', 'browser-profiles', 'agent')
}

/**
 * Проверить, слушает ли кто-то порт отладки.
 * @param port - порт CDP.
 * @returns true, когда порт принимает соединения.
 */
function probe(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(700)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/** Пользовательские агенты DSH/Electron — это не агентский Chrome. */
export function isAgentBrowserVersion(payload) {
  if (payload === null || typeof payload !== 'object') return false
  const browser = typeof payload.Browser === 'string' ? payload.Browser : ''
  const userAgent = typeof payload['User-Agent'] === 'string' ? payload['User-Agent'] : ''
  if (!browser.startsWith('Chrome/')) return false
  return !/Electron|dsh-desktop/i.test(userAgent)
}

/** Проверить, что на порту именно агентский Chrome (а не DSH/Electron). */
async function probeChrome(port) {
  if (!(await probe(port))) return false
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(900) })
    if (!response.ok) return false
    const payload = await response.json()
    return isAgentBrowserVersion(payload)
  } catch {
    return false
  }
}

/** Найти порт, на котором уже работает агентский Chrome. */
async function findChromePort() {
  for (const port of PORTS) {
    if (await probeChrome(port)) return port
  }
  return null
}

/** Найти свободный порт из списка (не занятый ничем). */
async function findFreePort() {
  for (const port of PORTS) {
    if (!(await probe(port))) return port
  }
  return null
}

/** Дождаться, пока Chrome откроет порт отладки. */
async function waitForPort(port) {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await probe(port)) return true
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return false
}

/**
 * Запустить Chrome отдельным процессом, не привязывая его к Host.
 * @param chromePath - исполняемый файл браузера.
 * @param dir - каталог профиля.
 * @param port - порт отладки.
 * @returns pid запущенного процесса.
 */
function launch(chromePath, dir, port) {
  const args = [
    `--user-data-dir=${dir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    HOME_PAGE,
  ]
  const child = spawn(chromePath, args, { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
  const pid = child.pid ?? null
  void appendLog('start', true, pid === null ? 'Chrome запущен' : `Chrome запущен, pid ${pid}`)
  return pid
}

/** JSON-ответ для маршрута. */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}


/** Записать событие в общий журнал плагина. */
async function appendLog(kind, ok, message) {
  try {
    const home = process.env.DSH_HOME
    const base = typeof home === 'string' && home !== '' ? home : join(homedir(), '.dsh')
    const dir = join(base, 'dsh-browser-launcher')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'log.jsonl'), JSON.stringify({ at: new Date().toISOString(), plugin: 'dsh-browser-launcher', kind, ok, text: message }) + '\n', { encoding: 'utf8', flag: 'a' })
  } catch {
    // журнал необязателен
  }
}

export function apply(ctx) {
  const chromePath = findChrome()
  const dir = profileDir()

  ctx.effect(() => {
    ctx.connection.fetch.register({
      path: STATUS_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        const chromePort = await findChromePort()
        return json({
          ok: true,
          running: chromePort !== null,
          port: chromePort ?? PORT,
          profileDir: dir,
          chromePath,
        })
      },
    })

    ctx.connection.fetch.register({
      path: START_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        const chromePort = await findChromePort()
        if (chromePort !== null) {
          return json({ ok: true, running: true, already: true, port: chromePort, profileDir: dir, chromePath })
        }
        if (chromePath === '') {
          return json({ ok: false, running: false, message: 'chrome.exe не найден в стандартных каталогах', chromePath })
        }
        const freePort = await findFreePort()
        if (freePort === null) {
          return json({
            ok: false,
            running: false,
            message: `Порты ${PORTS.join(', ')} заняты другими приложениями — освободите один из них`,
            chromePath,
          })
        }
        try {
          const pid = launch(chromePath, dir, freePort)
          const running = await waitForPort(freePort)
          return json({ ok: true, running, pid, port: freePort, profileDir: dir, chromePath })
        } catch (error) {
          return json({
            ok: false,
            running: false,
            message: error instanceof Error ? error.message : String(error),
            chromePath,
          })
        }
      },
    })
  }, 'dsh-browser-launcher: routes')
}

