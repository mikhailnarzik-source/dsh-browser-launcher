// Смоук-тест клиентской половины: грузим ../client.js как модуль, перехватываем
// регистрацию фабрики, вызываем её и apply() с заглушками сервисов, затем
// «рендерим» карточку и страницу, чтобы поймать ошибки времени выполнения.
// Запуск: node test/smoke.mjs
const registrations = []
let row

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
      register: (ns, map) => registrations.push(['locale.register', ns, Object.keys(map).join(',')]),
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

console.log('OK: фабрика, apply, карточка и страница отработали без ошибок')
