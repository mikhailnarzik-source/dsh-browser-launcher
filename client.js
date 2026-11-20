/**
 * Client-часть `dsh-browser-launcher`.
 *
 * Даёт правой панели карточку на странице «Старт»: один клик поднимает
 * агентский Chrome. Карточка зарегистрирована как guide-entry собственного
 * типа вкладки, поэтому стоит в одном ряду с «Файлами», «Терминалом» и
 * «Браузером», и вдобавок открывается как страница (там же статус и подсказки).
 */
window.__ModuleLoader__.load({
  id: 'dsh-browser-launcher',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'browserLauncher'
    const TYPE_ID = 'dsh-browser-launcher'
    const KIND = 'browser-launcher'
    const START_PATH = '/api/dsh-browser-launcher/start'
    const STATUS_PATH = '/api/dsh-browser-launcher/status'

    const en = {
      'type.label': 'Agent browser',
      title: 'Launch browser',
      description: 'Chrome with the agent profile and saved sign-ins',
      launchAction: 'Launch',
      starting: 'Starting…',
      running: 'Running',
      idle: 'Not running',
      failed: 'Launch failed',
      statusRunning: 'The agent browser is running — the assistant can see the window.',
      statusStopped: 'The agent browser is not running. Launch it to let the assistant browse.',
      profileLabel: 'Profile directory',
      portLabel: 'Debug port',
      pageHint: 'The window is an ordinary Chrome with its own profile. Sign-ins live on disk, so they survive restarts of both Chrome and DSH. Closing the window only removes the assistant’s access, not the sessions.',
      refresh: 'Check again',
    }

    const ru = {
      'type.label': 'Браузер агента',
      title: 'Запустить браузер',
      description: 'Chrome с профилем агента и сохранёнными входами',
      launchAction: 'Запустить',
      starting: 'Запускаю…',
      running: 'Работает',
      idle: 'Не запущен',
      failed: 'Не удалось',
      statusRunning: 'Браузер агента запущен — ассистент видит окно.',
      statusStopped: 'Браузер агента не запущен. Запусти его, чтобы ассистент мог работать со страницами.',
      profileLabel: 'Каталог профиля',
      portLabel: 'Порт отладки',
      pageHint: 'Это обычный Chrome со своим профилем. Входы хранятся на диске и переживают перезапуск и Chrome, и DSH. Закрытие окна отнимает у ассистента доступ, но не сессии.',
      refresh: 'Проверить снова',
    }

    let translate = key => key

    async function post(path, payload) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    /** Глиф: глобус с треугольником запуска. */
    function Icon(props) {
      const size = typeof props?.size === 'number' ? props.size : 26
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: 11, cy: 12, r: 8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('ellipse', { cx: 11, cy: 12, rx: 3.4, ry: 8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M3.2 12h15.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M15.5 9.4 21.4 12l-5.9 2.6z', fill: 'currentColor' }),
      )
    }

    const S = {
      card: {
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        minHeight: 56,
        padding: '14px 20px',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsl-guide-entry-radius, 20px)',
        background: 'var(--dsw-alias-bg-layer-1)',
        transition: 'background 120ms ease',
      },
      icon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        width: 26,
        height: 26,
        color: 'var(--dsw-alias-label-secondary)',
      },
      text: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
      title: {
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 14,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      description: {
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: 11,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      chip: { flex: 'none', fontSize: 11, lineHeight: 1.4, color: 'var(--dsw-alias-label-tertiary)' },
      dot: (color) => ({ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block', marginRight: 6 }),
      page: { display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', color: 'inherit' },
      pageTitle: { fontSize: 15, color: 'var(--dsw-alias-label-primary)' },
      pageText: { fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      primary: {
        alignSelf: 'flex-start',
        padding: '8px 16px',
        borderRadius: 999,
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'inherit',
        font: 'inherit',
        fontSize: 13,
        cursor: 'pointer',
      },
      meta: { fontSize: 11, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' },
    }

    /** Состояние запуска, общее для карточки и страницы. */
    function useLauncher() {
      const [phase, setPhase] = React.useState('unknown')
      const [status, setStatus] = React.useState(null)
      const [message, setMessage] = React.useState('')

      const readStatus = React.useCallback(async () => {
        try {
          const result = await post(STATUS_PATH, {})
          setStatus(result)
          setPhase(result?.running === true ? 'running' : 'idle')
        } catch (cause) {
          setMessage(String(cause?.message ?? cause))
          setPhase('idle')
        }
      }, [])

      React.useEffect(() => {
        void readStatus()
      }, [readStatus])

      const launch = React.useCallback(async () => {
        setPhase('starting')
        setMessage('')
        try {
          const result = await post(START_PATH, {})
          setStatus(result)
          if (result?.ok === true && result?.running === true) setPhase('running')
          else {
            setPhase('failed')
            setMessage(String(result?.message ?? 'start failed'))
          }
        } catch (cause) {
          setPhase('failed')
          setMessage(String(cause?.message ?? cause))
        }
      }, [])

      return { phase, status, message, launch, readStatus }
    }

    function phaseLabel(phase, t) {
      if (phase === 'running') return t('running')
      if (phase === 'starting') return t('starting')
      if (phase === 'failed') return t('failed')
      return t('idle')
    }

    function phaseColor(phase) {
      if (phase === 'running') return '#2f9e44'
      if (phase === 'starting') return '#e0a100'
      if (phase === 'failed') return '#d1242f'
      return 'var(--dsw-alias-label-tertiary)'
    }

    /** Карточка на странице «Старт»: клик по всей площади запускает браузер. */
    function LaunchCard(props) {
      const t = (key) => translate(key)
      const { phase, message, launch } = useLauncher()
      const [hover, setHover] = React.useState(false)
      const busy = phase === 'starting'
      const title = typeof props?.title === 'string' && props.title !== '' ? props.title : t('title')
      const description = typeof props?.description === 'string' ? props.description : t('description')
      const suffix = phase === 'failed' && message !== '' ? ` · ${message}` : ''

      return h(
        'button',
        {
          type: 'button',
          'data-browser-launcher': 'card',
          onClick: () => {
            if (!busy) void launch()
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: hover ? { ...S.card, background: 'rgba(127,127,127,0.10)' } : S.card,
        },
        h('span', { style: S.icon }, h(Icon, { size: 26 })),
        h(
          'span',
          { style: S.text },
          h('span', { style: S.title }, title),
          h('span', { style: S.description }, `${description}${suffix}`),
        ),
        h(
          'span',
          { style: S.chip },
          h('span', { style: S.dot(phaseColor(phase)) }),
          phaseLabel(phase, t),
        ),
      )
    }

    /** Страница типа: статус, кнопка и подсказки. */
    function LauncherPage() {
      const t = (key) => translate(key)
      const { phase, status, message, launch, readStatus } = useLauncher()
      const busy = phase === 'starting'

      return h(
        'div',
        { style: S.page },
        h('div', { style: S.pageTitle }, phase === 'running' ? t('statusRunning') : t('statusStopped')),
        h(
          'div',
          { style: { display: 'flex', gap: 10, alignItems: 'center' } },
          h(
            'button',
            {
              type: 'button',
              style: S.primary,
              disabled: busy,
              onClick: () => {
                void launch()
              },
            },
            busy ? t('starting') : t('launchAction'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: S.primary,
              onClick: () => {
                void readStatus()
              },
            },
            t('refresh'),
          ),
        ),
        h(
          'div',
          { style: S.meta },
          status?.profileDir === undefined ? null : h('div', null, `${t('profileLabel')}: ${status.profileDir}`),
          status?.port === undefined ? null : h('div', null, `${t('portLabel')}: ${status.port}`),
          message === '' ? null : h('div', { style: { color: '#d1242f' } }, message),
        ),
        h('div', { style: S.pageText }, t('pageHint')),
      )
    }

    function apply(ctx) {
      try {
        ctx.locale.register(NS, { en, ru })
        translate = ctx.locale.bind(NS)
      } catch (error) {
        console.error('[dsh-browser-launcher] локаль недоступна:', error)
      }

      try {
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TYPE_ID,
          kind: KIND,
          title: () => translate('type.label'),
          guide: [{
            id: 'launch',
            order: 40,
            title: () => translate('title'),
            description: () => translate('description'),
            icon: Icon,
          }],
        }), 'dsh-browser-launcher.type')
      } catch (error) {
        console.error('[dsh-browser-launcher] тип вкладки недоступен:', error)
      }

      try {
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
          name: 'sidebar.right.tab.guide.entry',
          key: TYPE_ID,
          locale: NS,
        }, LaunchCard)), 'dsh-browser-launcher.guide')
      } catch (error) {
        console.error('[dsh-browser-launcher] карточка недоступна:', error)
      }

      try {
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TYPE_ID,
          locale: NS,
        }, LauncherPage)), 'dsh-browser-launcher.page')
      } catch (error) {
        console.error('[dsh-browser-launcher] страница недоступна:', error)
      }
    }

    return { apply, inject: ['slots', 'locale', 'sidebarRightTabs'], NS }
  },
})
