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
      checking: 'Checking…',
      launchSection: 'Launch',
      profileSection: 'Profile and port',
      hintSection: 'How it works',
      launchHint: 'One click starts Chrome with the agent profile and the debug port. The assistant connects to that window.',
      emptyValue: 'not available yet',
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
      checking: 'Проверяю…',
      launchSection: 'Запуск',
      profileSection: 'Профиль и порт',
      hintSection: 'Как это работает',
      launchHint: 'Один клик поднимает Chrome с профилем агента и портом отладки — ассистент подключается к этому окну.',
      emptyValue: 'пока нет данных',
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

    /** Горизонтальная полоса-разделитель внутри карточки. */
    const DIVIDER = { height: 1, background: 'var(--dsw-alias-border-l1)' }

    const ACCENT = 'var(--dsw-alias-brand-primary)'

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

      /* --- Страница плагина: единый стиль -------------------------------- */
      page: {
        width: '100%',
        maxWidth: 960,
        margin: '0 auto',
        padding: '24px 28px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: 'inherit',
      },
      header: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
      logo: {
        flex: 'none',
        width: 52,
        height: 52,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ACCENT,
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent))',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)',
      },
      titles: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 220px' },
      heading: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.25, color: 'var(--dsw-alias-label-primary)' },
      subtitle: {
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '64ch',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      chipStatus: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: 1.4,
        color: 'var(--dsw-alias-label-secondary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
        whiteSpace: 'nowrap',
      },
      refresh: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 9,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
      section: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      },
      sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      stripe: { flex: 'none', width: 3, height: 14, borderRadius: 2, background: ACCENT },
      statusText: { margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      primary: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 36,
        padding: '0 16px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-bg-base)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      },
      field: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
      fieldLabel: { fontSize: 11, lineHeight: 1.4, letterSpacing: '0.02em', color: 'var(--dsw-alias-label-tertiary)' },
      fieldValue: {
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-primary)',
        wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      },
      error: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-state-error-primary)' },
    }

    /** Адаптив: на узком экране отступы меньше, шапка складывается в колонку. */
    const PAGE_CSS =
      '@media (max-width: 760px){' +
      '[data-dsh-bl-page]{padding:18px 16px 32px !important}' +
      '[data-dsh-bl-header]{align-items:flex-start}' +
      '[data-dsh-bl-actions]{margin-left:0 !important;width:100%}' +
      '}'

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
      if (phase === 'running') return 'var(--dsw-alias-state-success-primary)'
      if (phase === 'starting') return 'var(--dsw-alias-state-warn-primary)'
      if (phase === 'failed') return 'var(--dsw-alias-state-error-primary)'
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

    /** Одна строка «подпись — значение» в карточке профиля. */
    function Field(props) {
      return h(
        'div',
        { style: S.field },
        h('span', { style: S.fieldLabel }, props.label),
        h('span', { style: S.fieldValue }, props.value),
      )
    }

    /** Страница типа: статус, кнопка, профиль, порт и подсказка. */
    function LauncherPage() {
      const t = (key) => translate(key)
      const { phase, status, message, launch, readStatus } = useLauncher()
      const busy = phase === 'starting'
      const profileValue =
        status?.profileDir === undefined || status?.profileDir === '' ? t('emptyValue') : String(status.profileDir)
      const portValue = status?.port === undefined || status?.port === null ? t('emptyValue') : String(status.port)

      return h(
        'div',
        { style: S.page, 'data-dsh-bl-page': 'page' },
        h('style', null, PAGE_CSS),
        h(
          'div',
          { style: S.header, 'data-dsh-bl-header': 'header' },
          h('div', { style: S.logo }, h(Icon, { size: 26 })),
          h(
            'div',
            { style: S.titles },
            h('h1', { style: S.heading }, t('type.label')),
            h('p', { style: S.subtitle }, t('description')),
          ),
          h(
            'div',
            { style: S.actions, 'data-dsh-bl-actions': 'actions' },
            h(
              'span',
              { style: S.chipStatus, 'data-dsh-bl-chip': 'status' },
              h('span', { style: S.dot(phaseColor(phase)) }),
              phaseLabel(phase, t),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.refresh,
                disabled: busy,
                title: t('refresh'),
                'aria-label': t('refresh'),
                onClick: () => {
                  void readStatus()
                },
              },
              h('span', { 'aria-hidden': true, style: { fontSize: 14, lineHeight: 1 } }, '↻'),
              h('span', null, busy ? t('checking') : t('refresh')),
            ),
          ),
        ),
        h(
          'div',
          { style: S.grid, 'data-dsh-bl-grid': 'grid' },
          h(
            'section',
            { style: S.section, 'data-dsh-bl-card': 'launch' },
            h('div', { style: S.sectionTitle }, h('span', { style: S.stripe }), t('launchSection')),
            h('p', { style: S.statusText }, phase === 'running' ? t('statusRunning') : t('statusStopped')),
            h('p', { style: S.hint }, t('launchHint')),
            message === '' ? null : h('p', { style: S.error }, message),
            h(
              'div',
              { style: S.row },
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
            ),
          ),
          h(
            'section',
            { style: S.section, 'data-dsh-bl-card': 'profile' },
            h('div', { style: S.sectionTitle }, h('span', { style: S.stripe }), t('profileSection')),
            h('div', { style: DIVIDER }),
            h(Field, { label: t('profileLabel'), value: profileValue }),
            h(Field, { label: t('portLabel'), value: portValue }),
          ),
        ),
        h(
          'section',
          { style: S.section, 'data-dsh-bl-card': 'hint' },
          h('div', { style: S.sectionTitle }, h('span', { style: S.stripe }), t('hintSection')),
          h('p', { style: S.hint }, t('pageHint')),
        ),
      )
    }

    /** Компактная карточка для сводного режима страницы плагина. */
    function LauncherSummary() {
      const t = (key) => translate(key)
      return h(
        'div',
        { style: S.section, 'data-dsh-bl-card': 'summary' },
        h(
          'div',
          { style: S.row },
          h('span', { style: { ...S.logo, width: 34, height: 34, borderRadius: 11 } }, h(Icon, { size: 18 })),
          h(
            'div',
            { style: S.titles },
            h('span', { style: S.sectionTitle }, t('type.label')),
            h('span', { style: S.hint }, t('description')),
          ),
        ),
        h('p', { style: S.hint }, t('pageHint')),
      )
    }

    /** Имя пакета из subject страницы плагина: bundle или одиночный плагин. */
    function packageNameOf(props) {
      const subject = props?.subject
      if (subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string') return subject.pkg.name
      return typeof subject?.id === 'string' ? subject.id : ''
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

      // Страница плагина в «Плагинах»: тот же экран запуска в едином стиле.
      try {
        ctx.effect(() => ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
          name: 'plugins.detail.section',
          id: 'dsh-browser-launcher-detail',
          order: 44,
          locale: NS,
        }, (props) => {
          if (packageNameOf(props) !== 'dsh-browser-launcher') return null
          if (props?.view === 'summary') return h(LauncherSummary, props)
          return h(LauncherPage, props)
        })), 'dsh-browser-launcher.detail')
      } catch (error) {
        console.error('[dsh-browser-launcher] секция страницы недоступна:', error)
      }
    }

    return { apply, inject: ['slots', 'locale', 'sidebarRightTabs'], NS }
  },
})
