// Тест собственной панели dsh-browser-launcher: клик в левой панели открывает
// ТОЛЬКО настройки запуска браузера (ту же страницу, что в «Плагинах»), а не
// страницу плагин-менеджера с описанием, источником и версией. Проверяем:
//   • main-панель с ключом `plugin-browser` регистрируется всегда;
//   • строка `sidebar.panellist` с id `plugin-browser` — только по pinned из
//     localStorage `dsh-polish:panel-visibility`;
//   • CustomEvent `dsh-polish:panels-changed` включает и снимает строку;
//   • страница плагина в «Плагинах» (LauncherPage) не изменилась.
// Запуск: node --test
import test from 'node:test'
import assert from 'node:assert/strict'

const PANEL_ID = 'plugin-browser'
const PANEL_STATE_KEY = 'dsh-polish:panel-visibility'
const PANELS_CHANGED_EVENT = 'dsh-polish:panels-changed'

let row
const listeners = new Map()

function createStorage(entries = {}) {
  const data = new Map(Object.entries(entries))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
  }
}

const windowStub = {
  __ModuleLoader__: { load: (value) => { row = value } },
  localStorage: createStorage(),
  addEventListener(type, callback) {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(callback)
  },
  removeEventListener(type, callback) {
    listeners.get(type)?.delete(callback)
  },
  dispatchEvent(event) {
    for (const callback of [...(listeners.get(event.type) ?? [])]) callback(event)
    return true
  },
}

globalThis.window = windowStub
await import('../client.js')

assert.equal(row?.id, 'dsh-browser-launcher', 'фабрика загружена под именем пакета')

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

const plugin = row.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
})

/** Свежий стенд: реестр слотов, эффекты, словари и контекст для одного apply. */
function createHarness() {
  const registry = new Map()
  const effects = []
  const dictionaries = { ru: {}, en: {} }
  let captured = {}
  const slots = {
    inject(_name, install) {
      const dispose = install()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    register(options, component) {
      const key = options.key ?? options.id ?? 'default'
      let bucket = registry.get(options.name)
      if (bucket === undefined) {
        bucket = new Map()
        registry.set(options.name, bucket)
      }
      bucket.set(key, { options, component })
      captured[options.name] = component
      return () => { bucket.delete(key) }
    },
    list(name) { return [...(registry.get(name)?.values() ?? [])] },
  }
  const ctx = {
    slots,
    locale: {
      register: (_ns, maps) => {
        Object.assign(dictionaries, maps)
      },
      bind: () => (key) => dictionaries.ru[key] ?? dictionaries.en[key] ?? key,
    },
    effect(callback, label) {
      const dispose = callback()
      effects.push({ label, dispose })
      return () => { if (typeof dispose === 'function') dispose() }
    },
    sidebarRightTabs: {
      register: () => () => {},
    },
  }
  return {
    ctx,
    slots,
    effects,
    component(name) { return captured[name] },
    apply() { plugin.apply(ctx) },
    dispose() { for (const effect of effects) if (typeof effect.dispose === 'function') effect.dispose() },
  }
}

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) {
    if (Array.isArray(child)) for (const item of child) walk(item, visit)
    else walk(child, visit)
  }
}

function findAll(root, predicate) {
  const found = []
  walk(root, (node) => {
    if (predicate(node)) found.push(node)
  })
  return found
}

function textOf(node) {
  const parts = []
  walk(node, (item) => {
    for (const child of item.children ?? []) if (typeof child === 'string') parts.push(child)
  })
  return parts.join(' ')
}

function panelOf(app) {
  return app.slots.list('main').find((entry) => entry.options.key === PANEL_ID)
}

function sidebarOf(app) {
  return app.slots.list('sidebar.panellist').find((entry) => entry.options.id === PANEL_ID)
}

function setPinned(...ids) {
  windowStub.localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({ visible: [...ids], pinned: [...ids] }))
}

test('main-панель plugin-browser: только настройки, без обвязки плагин-менеджера', () => {
  windowStub.localStorage = createStorage()
  const app = createHarness()
  app.apply()

  const main = panelOf(app)
  assert.ok(main, 'main-панель с ключом plugin-browser зарегистрирована')
  const page = main.component({})

  assert.equal(page?.props?.['data-dsh-bl-panel'], 'panel', 'обёртка панели помечена data-атрибутом')
  const inner = findAll(page, (node) => node?.props?.['data-dsh-bl-panel-page'] === 'page')[0]
  assert.ok(inner, 'внутри панели — страница настроек запуска')
  assert.equal(inner.props.style.maxWidth, 960, 'центрирование maxWidth 960')
  assert.equal(inner.props.style.margin, '0 auto', 'margin auto')
  assert.equal(inner.props.style.padding, '24px 28px 40px', 'padding 24/28/40')

  const headers = findAll(page, (node) => node?.props?.['data-dsh-bl-panel-header'] === 'header')
  assert.equal(headers.length, 1, 'шапка одна')
  const logo = findAll(inner, (node) => node?.props?.style?.width === 52 && node.children?.[0] === '🌐')
  assert.equal(logo.length, 1, 'в шапке эмодзи 🌐 52')
  const heading = findAll(inner, (node) => node.type === 'h1' && node.props?.style?.fontSize === 20)
  assert.equal(heading.length, 1, 'заголовок 20px')
  assert.match(textOf(heading[0]), /Браузер агента/, 'название из словаря')
  const subtitle = findAll(inner, (node) => node.type === 'p' && node.props?.style?.fontSize === 12.5)
  assert.ok(subtitle.length >= 1, 'подзаголовок в шапке')

  const text = textOf(page)
  assert.doesNotMatch(text, /Описание/, 'в панели нет блока «Описание»')
  assert.doesNotMatch(text, /Источник/, 'в панели нет блока «Источник»')
  assert.doesNotMatch(text, /Версия/, 'в панели нет блока «Версия»')
  assert.doesNotMatch(text, /dsh-browser-launcher/, 'в панели нет имени пакета из плагин-менеджера')

  const cardIds = findAll(page, (node) => typeof node.props?.['data-dsh-bl-card'] === 'string')
    .map((card) => card.props['data-dsh-bl-card'])
  assert.deepEqual(cardIds, ['launch', 'profile', 'hint'], 'карточки настроек на месте')
  assert.match(text, /Запуск/, 'карточка запуска')
  assert.match(text, /Профиль и порт/, 'карточка профиля и порта')
  assert.match(text, /Как это работает/, 'карточка подсказки')

  app.dispose()
})

test('строка левой панели: по умолчанию закреплена, id и key совпадают', () => {
  windowStub.localStorage = createStorage()
  const app = createHarness()
  app.apply()

  const sidebar = sidebarOf(app)
  assert.ok(sidebar, 'строка sidebar.panellist зарегистрирована')
  assert.equal(sidebar.options.id, PANEL_ID, 'id строки — plugin-browser')
  assert.equal(panelOf(app)?.options.key, PANEL_ID, 'ключ main-панели — plugin-browser')
  assert.equal(sidebar.options.order, 30, 'порядок строки — 20 + индекс 10')
  assert.match(sidebar.options.label(), /Браузер агента/, 'подпись — название плагина')

  const icon = sidebar.component({ size: 16, active: false })
  assert.equal(icon?.props?.['data-dsh-bl-icon'], 'sidebar', 'иконка строки — эмодзи-компонент')
  assert.equal(icon.children?.[0], '🌐')

  app.dispose()
})

test('main-панель есть всегда, строка — только при pinned', () => {
  windowStub.localStorage = createStorage({
    [PANEL_STATE_KEY]: JSON.stringify({ visible: ['browser'], pinned: [] }),
  })
  const app = createHarness()
  app.apply()

  assert.ok(panelOf(app), 'main-панель зарегистрирована и без закрепления')
  assert.equal(sidebarOf(app), undefined, 'незакреплённая панель не попадает в левую панель')

  app.dispose()
})

test('событие dsh-polish:panels-changed перерегистрирует строку без перезагрузки', () => {
  windowStub.localStorage = createStorage({
    [PANEL_STATE_KEY]: JSON.stringify({ visible: ['browser'], pinned: ['browser'] }),
  })
  const app = createHarness()
  app.apply()
  assert.ok(sidebarOf(app), 'закреплённая панель видна')

  setPinned() // открепили
  windowStub.dispatchEvent({ type: PANELS_CHANGED_EVENT })
  assert.equal(sidebarOf(app), undefined, 'после события откреплённая строка исчезла')
  assert.ok(panelOf(app), 'main-панель осталась')

  setPinned('browser') // закрепили обратно
  windowStub.dispatchEvent({ type: PANELS_CHANGED_EVENT })
  assert.ok(sidebarOf(app), 'после события строка вернулась')
  assert.equal(sidebarOf(app).options.id, PANEL_ID)

  app.dispose()
  setPinned('browser')
  windowStub.dispatchEvent({ type: PANELS_CHANGED_EVENT })
  assert.equal(sidebarOf(app), undefined, 'после dispose подписка на событие снята')
})

test('страница плагина в «Плагинах» по-прежнему в едином стиле', () => {
  windowStub.localStorage = createStorage()
  const app = createHarness()
  app.apply()

  const page = app.component('sidebar.right.pane.tab')({})
  assert.equal(page?.props?.['data-dsh-bl-page'], 'page', 'LauncherPage помечен')
  assert.equal(page?.props?.style?.maxWidth, 960, 'центрирование сохранено')
  assert.equal(page?.props?.style?.margin, '0 auto')
  assert.equal(page?.props?.style?.padding, '24px 28px 40px')
  const headers = findAll(page, (node) => node?.props?.['data-dsh-bl-header'] === 'header')
  assert.equal(headers.length, 1, 'одна шапка')
  const chips = findAll(page, (node) => node?.props?.['data-dsh-bl-chip'] === 'status')
  assert.equal(chips.length, 1, 'статус-чип на месте')
  const chipStyle = chips[0].props.style
  assert.equal(chipStyle.display, 'inline-flex', 'чип собран на inline-flex')
  assert.equal(chipStyle.borderRadius, 10, 'чип — не пилюля, а кнопка: radius 10')
  assert.equal(chipStyle.height, 32, 'чип в шапке: height 32')
  assert.equal(chipStyle.padding, '0 12px', 'padding чипа 0 12')
  assert.match(String(chipStyle.border ?? ''), /^1px solid /, 'у чипа рамка 1px')
  assert.equal(chipStyle.fontWeight, 600, 'шрифт чипа 600')
  assert.equal(chipStyle.fontSize, 12.5, 'шрифт чипа 12.5')
  assert.equal(chipStyle.gap, 6, 'gap чипа 6')
  const chipDot = findAll(chips[0], (node) => node?.props?.style?.width === 6 && node?.props?.style?.height === 6)
  assert.equal(chipDot.length, 1, 'точка-индикатор 6px у чипа')
  assert.equal(chipDot[0].props.style.background, 'currentColor')
  const refresh = findAll(page, (node) => node?.props?.['data-dsh-bl-refresh'] === 'refresh')
  assert.equal(refresh.length, 1, 'кнопка «Проверить снова» на месте')
  assert.equal(
    findAll(page, (node) => typeof node.props?.['data-dsh-bl-card'] === 'string').length,
    3,
    'карточки настроек не задвоились',
  )

  app.dispose()
})
