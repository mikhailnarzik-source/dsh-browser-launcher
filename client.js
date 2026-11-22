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
    // Своя панель в левой панели: ключ main и id строки обязаны совпадать.
    const PANEL_ID = 'plugin-browser'
    const PANEL_PLUGIN_ID = 'browser'
    const PANEL_ORDER = 30
    const PANEL_EMOJI = '🌐'
    const PANEL_STATE_KEY = 'dsh-polish:panel-visibility'
    const PANELS_CHANGED_EVENT = 'dsh-polish:panels-changed'

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
      chip: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
        minWidth: 0,
        maxWidth: '100%',
      },
      chipTones: {
        ok: {
          border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, transparent)',
          background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)',
          color: 'var(--dsw-alias-state-success-primary)',
        },
        warn: {
          border: '1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent)',
          background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent)',
          color: 'var(--dsw-alias-state-warn-primary)',
        },
        error: {
          border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent)',
          background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent)',
          color: 'var(--dsw-alias-state-error-primary)',
        },
        muted: {
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
          color: 'var(--dsw-alias-label-secondary)',
        },
      },
      dot: { boxSizing: 'border-box', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flex: 'none' },

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
      refresh: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 32,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color .12s ease,border-color .12s ease,color .12s ease',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, alignItems: 'stretch' },
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
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
      rowFoot: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0, marginTop: 'auto' },
      primary: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 36,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color .12s ease,border-color .12s ease,color .12s ease',
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

    /** Адаптив и hover кнопок: то, что не выразить inline-стилями. */
    const PAGE_CSS =
      '[data-dsh-bl-primary]:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent) !important}' +
      '[data-dsh-bl-refresh]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover) !important}' +
      '[data-dsh-bl-primary]:focus-visible,[data-dsh-bl-refresh]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}' +
      '[data-dsh-bl-primary]:disabled,[data-dsh-bl-refresh]:disabled{opacity:0.55;cursor:default}' +
      '@media (max-width: 900px){' +
      '[data-dsh-bl-page]{padding:20px 20px 36px !important}' +
      '[data-dsh-bl-grid]{grid-template-columns:1fr !important}' +
      '}' +
      '@media (max-width: 640px){' +
      '[data-dsh-bl-page]{padding:18px 16px 32px !important}' +
      '[data-dsh-bl-header]{align-items:flex-start}' +
      '[data-dsh-bl-actions]{margin-left:0 !important;width:100%}' +
      '[data-dsh-bl-primary],[data-dsh-bl-refresh]{max-width:100%}' +
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

    /** Тон статус-чипа по фазе: success/warn/error/muted. */
    function phaseTone(phase) {
      if (phase === 'running') return 'ok'
      if (phase === 'starting') return 'warn'
      if (phase === 'failed') return 'error'
      return 'muted'
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
          { style: { ...S.chip, ...S.chipTones[phaseTone(phase)] }, 'data-dsh-bl-chip': 'state' },
          h('span', { style: S.dot }),
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

    /**
     * Настройки запуска: карточки статуса, профиля и подсказки. Один набор для
     * страницы плагина (plugins.detail.section) и для своей main-панели.
     */
    function launchSettings(t, launcher) {
      const { phase, status, message, launch } = launcher
      const busy = phase === 'starting'
      const profileValue =
        status?.profileDir === undefined || status?.profileDir === '' ? t('emptyValue') : String(status.profileDir)
      const portValue = status?.port === undefined || status?.port === null ? t('emptyValue') : String(status.port)
      return [
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
              { style: S.rowFoot },
              h(
                'button',
                {
                  type: 'button',
                  style: S.primary,
                  'data-dsh-bl-primary': 'launch',
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
      ]
    }

    /** Страница типа: статус, кнопка, профиль, порт и подсказка. */
    function LauncherPage() {
      const t = (key) => translate(key)
      const launcher = useLauncher()
      const { phase, readStatus } = launcher
      const busy = phase === 'starting'

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
              { style: { ...S.chip, ...S.chipTones[phaseTone(phase)] }, 'data-dsh-bl-chip': 'status', role: 'status' },
              h('span', { style: S.dot }),
              phaseLabel(phase, t),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.refresh,
                'data-dsh-bl-refresh': 'refresh',
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
        ...launchSettings(t, launcher),
      )
    }

    /** Прокручиваемая область main-панели: страница со своими отступами. */
    const PANEL_SCROLL = {
      flex: '1 1 auto',
      height: '100%',
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)',
    }

    /** Адаптив и верхний отступ main-панели (шапка окна на macOS). */
    const PANEL_CSS =
      'html[data-platform="darwin"] [data-dsh-bl-panel-page]{padding-top:calc(24px + var(--dsh-frame-top-clearance,0px)) !important}' +
      '@media (max-width: 900px){[data-dsh-bl-panel-page]{padding:20px 20px 36px !important}}' +
      '@media (max-width: 640px){[data-dsh-bl-panel-page]{padding:18px 16px 32px !important}}'

    /** Эмодзи-иконка строки левой панели: размер задаёт сама панель. */
    function PanelIcon(props) {
      const requested = Number(props?.size)
      const size = Number.isFinite(requested) && requested > 0 ? requested : 16
      return h(
        'span',
        {
          'data-dsh-bl-icon': 'sidebar',
          'aria-hidden': true,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size,
            height: size,
            fontSize: Math.round(size * 0.95),
            lineHeight: 1,
          },
        },
        PANEL_EMOJI,
      )
    }

    /**
     * Своя main-панель: центрированная страница с эмодзи-шапкой и теми же
     * настройками запуска. Никаких блоков «Описание / Источник / Версия» —
     * клик в левой панели открывает только элементы управления плагина.
     */
    function PluginPanelPage() {
      const t = (key) => translate(key)
      const launcher = useLauncher()
      return h(
        'div',
        { style: PANEL_SCROLL, 'data-dsh-bl-panel': 'panel' },
        h('style', null, PAGE_CSS + PANEL_CSS),
        h(
          'div',
          { style: S.page, 'data-dsh-bl-panel-page': 'page' },
          h(
            'div',
            { style: S.header, 'data-dsh-bl-panel-header': 'header' },
            h(
              'div',
              { style: { ...S.logo, fontSize: 26, lineHeight: 1 }, 'aria-hidden': true },
              PANEL_EMOJI,
            ),
            h(
              'div',
              { style: S.titles },
              h('h1', { style: S.heading }, t('type.label')),
              h('p', { style: S.subtitle }, t('description')),
            ),
          ),
          ...launchSettings(t, launcher),
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

      /* --- Своя панель в левой панели: только настройки, без «Плагинов» --- */
      /** Закреплена ли панель: состояние ведёт dsh-polish в localStorage. */
      function readPanelPinned() {
        try {
          const storage = typeof window !== 'undefined' ? window.localStorage : undefined
          if (storage === null || storage === undefined || typeof storage.getItem !== 'function') return true
          const raw = storage.getItem(PANEL_STATE_KEY)
          if (raw === null || raw === '') return true
          const state = JSON.parse(raw)
          if (state === null || typeof state !== 'object' || !Array.isArray(state.pinned)) return true
          return state.pinned.includes(PANEL_PLUGIN_ID)
        } catch {
          return true
        }
      }

      /** main-панель всегда, строка левой панели — только при pinned. */
      function setupPluginPanel() {
        const disposers = []
        try {
          const dispose = ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
          }, PluginPanelPage))
          if (typeof dispose === 'function') disposers.push(dispose)
        } catch (error) {
          console.error('[dsh-browser-launcher] main-панель недоступна:', error)
        }
        let disposeSidebar = null
        const syncSidebar = () => {
          const pinned = readPanelPinned()
          if (pinned && disposeSidebar === null) {
            try {
              disposeSidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: PANEL_ORDER,
                label: () => translate('type.label'),
                locale: NS,
              }, PanelIcon))
            } catch (error) {
              console.error('[dsh-browser-launcher] строка левой панели недоступна:', error)
            }
          } else if (!pinned && disposeSidebar !== null) {
            const dispose = disposeSidebar
            disposeSidebar = null
            try { dispose() } catch (error) { console.error('[dsh-browser-launcher] не удалось снять строку левой панели:', error) }
          }
        }
        syncSidebar()
        const onPanelsChanged = () => syncSidebar()
        // Запасной канал: изменение localStorage в другой вкладке.
        const onStorage = (event) => {
          if (event?.key === undefined || event.key === null || event.key === PANEL_STATE_KEY) syncSidebar()
        }
        try {
          if (typeof window.addEventListener === 'function') {
            window.addEventListener(PANELS_CHANGED_EVENT, onPanelsChanged)
            window.addEventListener('storage', onStorage)
          }
        } catch {
          // нет window в офлайн-проверках — панель работает без событий
        }
        return () => {
          try {
            window.removeEventListener(PANELS_CHANGED_EVENT, onPanelsChanged)
            window.removeEventListener('storage', onStorage)
          } catch {
            // окно уже недоступно
          }
          if (disposeSidebar !== null) {
            const dispose = disposeSidebar
            disposeSidebar = null
            try { dispose() } catch { /* плагин уже выгружен */ }
          }
          for (const dispose of disposers.reverse()) {
            try { dispose() } catch { /* плагин уже выгружен */ }
          }
        }
      }
      try {
        ctx.effect(() => setupPluginPanel(), 'dsh-browser-launcher.left-panel')
      } catch (error) {
        console.error('[dsh-browser-launcher] панель в левой панели недоступна:', error)
      }
    }

    return { apply, inject: ['slots', 'locale', 'sidebarRightTabs'], NS }
  },
})
