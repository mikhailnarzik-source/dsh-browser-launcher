// Смоук-тест клиентской половины: грузим ../client.js как модуль, перехватываем
// регистрацию фабрики, вызываем её и apply() с заглушками сервисов, затем
// «рендерим» карточку, страницу и секцию страницы плагина, чтобы поймать
// ошибки времени выполнения и проверить единый стиль страниц.
// Запуск: node test/smoke.mjs
const registrations = []
let row
let localeMaps = null

globalThis.window = {
  __ModuleLoader__: {
    load(value) { row = value },
  },
}

await import('../client.js')

if (!row || typeof row.factory !== 'function') {
  console.error('FAIL: фабрика не зарегистрирована')
  process.exit(1)
}
if (row.id !== 'dsh-browser-launcher') {
  console.error('FAIL: неверный id загрузки:', row.id)
  process.exit(1)
}

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

const captured = {}

function makeServices() {
  return {
    locale: {
      register: (ns, map) => {
        localeMaps = map
        registrations.push(['locale.register', ns, Object.keys(map).join(',')])
      },
      bind: (ns) => (key) => `${ns}.${key}`,
    },
    effect: (fn, label) => {
      const disposer = fn()
      registrations.push(['effect', label, typeof disposer])
      return () => {}
    },
    sidebarRightTabs: {
      register: (definition) => {
        registrations.push([
          'tabs.register',
          definition.id,
          definition.kind,
          JSON.stringify((definition.guide ?? []).map((entry) => ({
            id: entry.id,
            order: entry.order,
            title: entry.title(),
            description: entry.description(),
          }))),
        ])
        return () => {}
      },
    },
    slots: {
      inject: (name, install) => {
        registrations.push(['slots.inject', name])
        install()
        return () => {}
      },
      register: (options, component) => {
        captured[options.name] = component
        registrations.push(['slots.register', options.name, options.key, typeof component])
        return () => {}
      },
    },
  }
}

const plugin = row.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
})

if (typeof plugin?.apply !== 'function') {
  console.error('FAIL: фабрика не вернула плагин с apply, получили:', plugin)
  process.exit(1)
}
if (!Array.isArray(plugin.inject) || !plugin.inject.includes('sidebarRightTabs')) {
  console.error('FAIL: плагин не объявляет inject')
  process.exit(1)
}

plugin.apply(makeServices())
for (const line of registrations) console.log(line.join(' | '))

const CardComponent = captured['sidebar.right.tab.guide.entry']
const PageComponent = captured['sidebar.right.pane.tab']
if (typeof CardComponent !== 'function' || typeof PageComponent !== 'function') {
  console.error('FAIL: компоненты не зарегистрированы')
  process.exit(1)
}

const cardTree = CardComponent({
  entryId: 'launch',
  kind: 'browser-launcher',
  title: 'Запустить браузер',
  description: 'Chrome с профилем агента',
  t: (key) => key,
  useTabInfo: () => ({}),
})
if (cardTree?.type !== 'button') {
  console.error('FAIL: карточка не отрисовалась как кнопка')
  process.exit(1)
}

const pageTree = PageComponent({ t: (key) => key })
if (pageTree?.type !== 'div') {
  console.error('FAIL: страница не отрисовалась')
  process.exit(1)
}

/* --- Единый стиль страницы: центрирование, шапка, карточки, чип ---------- */

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

const pageFrame = pageTree.props?.style ?? {}
if (pageFrame.maxWidth !== 960) {
  console.error('FAIL: страница не центрирована по maxWidth 960, получили:', pageFrame.maxWidth)
  process.exit(1)
}
if (pageFrame.margin !== '0 auto') {
  console.error('FAIL: у страницы нет margin auto, получили:', pageFrame.margin)
  process.exit(1)
}
if (pageFrame.padding !== '24px 28px 40px') {
  console.error('FAIL: неверные отступы страницы, получили:', pageFrame.padding)
  process.exit(1)
}

const headers = findAll(pageTree, (node) => node.props?.['data-dsh-bl-header'] === 'header')
if (headers.length !== 1) {
  console.error('FAIL: шапка страницы не найдена')
  process.exit(1)
}
const logos = findAll(pageTree, (node) => node.props?.style?.width === 52)
if (logos.length !== 1) {
  console.error('FAIL: иконка 52 в шапке не найдена')
  process.exit(1)
}
const headings = findAll(pageTree, (node) => node.type === 'h1' && node.props?.style?.fontSize === 20)
if (headings.length !== 1) {
  console.error('FAIL: заголовок 20px в шапке не найден')
  process.exit(1)
}
const chips = findAll(pageTree, (node) => node.props?.['data-dsh-bl-chip'] === 'status')
if (chips.length !== 1 || chips[0].props?.style?.borderRadius !== 999) {
  console.error('FAIL: статус-чип не найден или не круглый')
  process.exit(1)
}
const refreshButtons = findAll(pageTree, (node) => node.type === 'button' && node.props?.style?.height === 32)
if (refreshButtons.length !== 1) {
  console.error('FAIL: кнопка «Обновить» в шапке не найдена')
  process.exit(1)
}
const cards = findAll(pageTree, (node) => typeof node.props?.['data-dsh-bl-card'] === 'string')
if (cards.length < 3) {
  console.error('FAIL: карточки-секции не отрисованы, нашли:', cards.length)
  process.exit(1)
}
if (cards.some((card) => card.props?.style?.borderRadius !== 14)) {
  console.error('FAIL: у карточки-секции неверный радиус')
  process.exit(1)
}
const primaryButtons = findAll(pageTree, (node) => node.type === 'button' && node.props?.style?.height === 36)
if (primaryButtons.length !== 1) {
  console.error('FAIL: primary-кнопка запуска не найдена')
  process.exit(1)
}

const styleTags = findAll(pageTree, (node) => node.type === 'style')
const css = styleTags.map((node) => node.children?.join('') ?? '').join('\n')
if (!css.includes('max-width: 760px')) {
  console.error('FAIL: адаптив страницы (media query) не найден')
  process.exit(1)
}
if (!css.includes('data-dsh-bl-page')) {
  console.error('FAIL: media query не привязана к странице')
  process.exit(1)
}

/* --- Секция страницы плагина: фильтр по пакету, сводка и страница -------- */

const DetailComponent = captured['plugins.detail.section']
if (typeof DetailComponent !== 'function') {
  console.error('FAIL: секция страницы плагина не зарегистрирована')
  process.exit(1)
}
if (DetailComponent({ subject: { kind: 'bundle', pkg: { name: 'dsh-calendar' } } }) !== null) {
  console.error('FAIL: секция рисуется для чужого плагина')
  process.exit(1)
}
const detailPage = DetailComponent({ subject: { kind: 'bundle', pkg: { name: 'dsh-browser-launcher' } } })
if (typeof detailPage?.type !== 'function') {
  console.error('FAIL: секция не вернула страницу')
  process.exit(1)
}
const detailTree = detailPage.type(detailPage.props)
if (detailTree?.props?.['data-dsh-bl-page'] !== 'page') {
  console.error('FAIL: страница плагина не отрисовалась')
  process.exit(1)
}
const summaryTree = DetailComponent({
  subject: { kind: 'bundle', pkg: { name: 'dsh-browser-launcher' } },
  view: 'summary',
})
if (typeof summaryTree?.type !== 'function') {
  console.error('FAIL: сводка страницы плагина не отрисовалась')
  process.exit(1)
}
const summary = summaryTree.type(summaryTree.props)
if (summary?.type !== 'div') {
  console.error('FAIL: сводка вернула неожиданный элемент')
  process.exit(1)
}

/* --- Словари: русский и английский описывают одно и то же ----------------- */

if (localeMaps === null || localeMaps.ru === undefined || localeMaps.en === undefined) {
  console.error('FAIL: словари ru/en не зарегистрированы')
  process.exit(1)
}
const ruKeys = Object.keys(localeMaps.ru).sort()
const enKeys = Object.keys(localeMaps.en).sort()
if (ruKeys.join(',') !== enKeys.join(',')) {
  console.error('FAIL: набор ключей ru и en различается:', ruKeys.filter((k) => !enKeys.includes(k)), enKeys.filter((k) => !ruKeys.includes(k)))
  process.exit(1)
}
for (const key of ['refresh', 'checking', 'launchSection', 'profileSection', 'hintSection', 'launchHint']) {
  if (localeMaps.ru[key] === undefined || localeMaps.en[key] === undefined) {
    console.error('FAIL: в словарях нет ключа', key)
    process.exit(1)
  }
}

console.log('OK: фабрика, apply, карточка, страница и секция плагина отработали без ошибок')
console.log('  страница: maxWidth 960, margin auto, padding 24/28/40, шапка, чип, карточки, адаптив')
console.log('  словари: ru/en, ключей:', ruKeys.length)
