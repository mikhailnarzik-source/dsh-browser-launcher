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
      fetch: async () => json({
        ok: true,
        running: await probe(PORT),
        port: PORT,
        profileDir: dir,
        chromePath,
      }),
    })

    ctx.connection.fetch.register({
      path: START_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        if (await probe(PORT)) {
          return json({ ok: true, running: true, already: true, port: PORT, profileDir: dir, chromePath })
        }
        if (chromePath === '') {
          return json({ ok: false, running: false, message: 'chrome.exe не найден в стандартных каталогах', chromePath })
        }
        try {
          const pid = launch(chromePath, dir, PORT)
          const running = await waitForPort(PORT)
          return json({ ok: true, running, pid, port: PORT, profileDir: dir, chromePath })
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
