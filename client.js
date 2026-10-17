/**
 * Codex model + reasoning-effort selector — client (web) bundle.
 *
 * Replaces DSH's compact `conversation.input.model` seat with a Codex-style
 * popover that holds two panes:
 *
 *   - `models` — the provider-grouped model list (Codex list styling)
 *   - `effort` — the pixel-replica reasoning-effort slider
 *
 * Every geometry value in `CSS` was measured frame-by-frame from the original
 * Codex desktop recording (93 frames); see `docs/codex-reasoning-slider-spec.md`.
 * The recording was captured at 1.385x, so CSS px = recorded px / 1.385.
 *
 * Written by hand against the documented host API:
 *   ctx.slots            — `conversation.input.model` seat
 *   ctx.modelDirectories — session-scoped catalog + `select()`
 *   ctx.sessions         — subagent address check
 *   ctx.locale           — dictionaries
 *
 * No host hooks are registered and no events are emitted, so the plugin stays
 * fail-open: if any anchor is missing it renders nothing instead of breaking the
 * composer.
 */

window.__ModuleLoader__.load({
  id: 'dsh-codex-model-effort-selector',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore, useMemo } = React;

    const NS = 'dsh-codex-model-effort-selector';
    const P = 'cmes';   // class prefix

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */
    /* Both dictionaries must carry an identical key set. Effort labels live
     * here too, so the ladder re-localises live when the user switches
     * language — no reload, no remount. */
    const zh = {
      choose: '选择模型', effort: '推理强度', fast: '1.5 倍速',
      usage: '用量更多', visual: '(仅视觉效果)', reset: '重置为默认',
      warning: '更快消耗使用额度', model: '切换模型', back: '返回',
      loading: '正在加载模型', empty: '没有可用模型',
      unsupported: '此模型未提供推理强度', retry: '重试',
      busy: '正在切换', failed: '切换失败',
      unavailable: '此会话不能切换模型',
      search: '搜索模型', noMatch: '没有匹配的模型', clear: '清除搜索',
      'effort.off': '关闭', 'effort.minimal': '极低', 'effort.low': '轻度',
      'effort.medium': '中', 'effort.high': '高', 'effort.xhigh': '极高',
      'effort.max': 'Ultra'
    };
    const en = {
      choose: 'Select model', effort: 'Reasoning effort', fast: '1.5x speed',
      usage: 'Uses more quota', visual: '(Visual only)', reset: 'Reset to default',
      warning: 'Consumes usage quota faster', model: 'Switch model', back: 'Back',
      loading: 'Loading models', empty: 'No available models',
      unsupported: 'This model provides no reasoning effort levels', retry: 'Retry',
      busy: 'Switching', failed: 'Selection failed',
      unavailable: 'Model selection unavailable',
      search: 'Search models', noMatch: 'No matching models', clear: 'Clear search',
      'effort.off': 'Off', 'effort.minimal': 'Minimal', 'effort.low': 'Light',
      'effort.medium': 'Medium', 'effort.high': 'High', 'effort.xhigh': 'Extra High',
      'effort.max': 'Ultra'
    };

    /* ------------------------------------------------------------------ *
     * Effort ladder — Codex vocabulary applied to whatever ids DSH reports.
     *
     * The original Codex slider is five evenly spaced stops labelled
     * 轻度 / 中 / 高 / 极高 / Ultra. We reuse that ladder for ordering, and
     * fall back to the model's own `name` for ids we do not recognise.
     * ------------------------------------------------------------------ */
    const EFFORT_ORDER = [
      'off', 'none', 'minimal', 'low', 'medium', 'mid',
      'high', 'xhigh', 'extra-high', 'max', 'ultra'
    ];
    /* Which ids map onto the localised labels above. */
    const EFFORT_KEY = {
      off: 'effort.off', none: 'effort.off', minimal: 'effort.minimal',
      low: 'effort.low', medium: 'effort.medium', mid: 'effort.medium',
      high: 'effort.high', xhigh: 'effort.xhigh', 'extra-high': 'effort.xhigh',
      max: 'effort.max', ultra: 'effort.max'
    };
    /* The "Ultra" tier: the one stop that turns the rail violet and raises the
     * quota warning. Keyed on the id, exactly like the original app, so a
     * 3-level model (light/high) never fakes an Ultra stop. */
    const PEAK_IDS = ['max', 'ultra'];
    const isPeakId = id => PEAK_IDS.includes(String(id ?? '').toLowerCase().trim());

    /* ------------------------------------------------------------------ *
     * Per-effort palette.
     *
     * Every value clears three WCAG floors, verified by `test/palette.mjs`,
     * SEPARATELY PER THEME (the shipped dark card #2a2b2e and the light card
     * #f8f9fa composite differ by ~13:1 in luminance, so no single ramp can
     * serve both — see the disjoint luminance windows in docs/ARCHITECTURE.md):
     *   A. fill vs the unfilled rail                      >= 2.5
     *   B. knob vs fill                                   >= 2.2
     *   C. heading ink vs card                            >= 4.5  — AA body text
     *
     * `minimal` cannot be a genuinely light blue in LIGHT mode: anything
     * lighter than ~#4a8ef8 drops below floor A against the pale rail and
     * washes out. The "low energy" feel therefore comes from ink + saturation,
     * not from lightness.
     *
     * `off` is deliberately neutral slate — a closed level must not look
     * energised, and it must not be mistakable for the pale-violet Ultra.
     * ------------------------------------------------------------------ */
    /* The ramp is ordered by HUE, not by lightness: 216.6deg -> 263.9deg,
     * blue drifting to violet as effort rises. Luminance is deliberately NOT
     * monotonic — violet is inherently darker than blue at equal saturation,
     * so demanding a darkening ramp would force `max` to desaturate toward
     * pink and stop reading as "Ultra". `max` is instead the most luminous of
     * the violet pair, which suits a peak level.
     * All fills clear >= 2.5 against the unfilled rail. */
    const EFFORT_FILL = {
      off: '#8a8a8f', minimal: '#4a8ef8', low: '#3a83f7', medium: '#4a72f2',
      high: '#5f5ce8', xhigh: '#7b48e8', max: '#914ef6'
    };
    const EFFORT_INK = {
      off: '#707073', minimal: '#2b62bd', low: '#2f6fd0', medium: '#3a55b8',
      high: '#4a3fc0', xhigh: '#6a35c8', max: '#8b46ee'
    };
    /* ------------------------------------------------------------------ *
     * Dark palette — solved per level against the SHIPPED dark surfaces
     * (`@deepseek-ai/dsh-client-ui-theme`, v0.2.0-rc.2):
     *   card  = --dsw-specific-menu #43454a73 over page #151517 -> #2a2b2e
     *   card token fallback = --dsw-alias-bg-layer-2            -> #2c2c2e
     *   card upper bound    = --dsw-alias-bg-layer-3            -> #353638
     *   rail  = --dsw-alias-bg-layer-1 (an inset groove)        -> #232324
     *   knob  = --dsw-alias-label-primary (a bright puck)       -> #f9fafb
     * Ink is checked against the LIGHTEST surface (#353638) so it clears 4.5
     * everywhere the component can be painted.
     *
     * The ramp keeps the light palette's HUE axis (216 -> 264deg, blue to
     * violet) but inverts the energy reading: in light mode effort read as a
     * deepening ink, while on a dark card darker ink means LESS visible, so
     * relative luminance now rises 0.245 -> 0.383 as effort climbs. Fills stay
     * below the knob's luminance so the knob still reads against the fill, and
     * inks stay above every dark surface so the level name never disappears.
     * ------------------------------------------------------------------ */
    const EFFORT_FILL_DARK = {
      off: '#737378', minimal: '#3684ff', low: '#448dff', medium: '#6e90ff',
      high: '#928fff', xhigh: '#b18dff', max: '#bd91ff'
    };
    const EFFORT_INK_DARK = {
      off: '#a9a9ae', minimal: '#73a9ff', low: '#76aafe', medium: '#8ba7ff',
      high: '#a4a2ff', xhigh: '#bc9cff', max: '#c39bff'
    };
    /* Unknown ids fall between `low` and `high` so a custom level still reads. */
    const FILL_FALLBACK = '#3a83f7';
    const INK_FALLBACK = '#2f6fd0';
    const FILL_FALLBACK_DARK = '#448dff';
    const INK_FALLBACK_DARK = '#76aafe';

    /** Which ladder bucket an effort id belongs to (for the palette). */
    function effortBucket(id) {
      const k = String(id ?? '').toLowerCase().trim();
      if (['off', 'none', '关闭', '无'].includes(k)) return 'off';
      if (k === 'minimal') return 'minimal';
      if (k === 'low') return 'low';
      if (k === 'medium' || k === 'mid') return 'medium';
      if (k === 'high') return 'high';
      if (k === 'xhigh' || k === 'extra-high') return 'xhigh';
      if (k === 'max' || k === 'ultra') return 'max';
      return null;
    }
    function fillFor(id, dark) {
      const b = effortBucket(id);
      if (b) return (dark ? EFFORT_FILL_DARK : EFFORT_FILL)[b];
      return dark ? FILL_FALLBACK_DARK : FILL_FALLBACK;
    }
    function inkFor(id, dark) {
      const b = effortBucket(id);
      if (b) return (dark ? EFFORT_INK_DARK : EFFORT_INK)[b];
      return dark ? INK_FALLBACK_DARK : INK_FALLBACK;
    }
    /** Mix a hex colour toward another by `t` (0..1). Used for the rail track. */
    function mixHex(a, b, t) {
      const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
      const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
      const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
      return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    }
    /* self-test: a non-linear mix would silently break the track's floor A */
    if (mixHex('#000000', '#ffffff', 0.5) !== '#808080') {
      throw new Error('mixHex self-test failed: the tint is not linear');
    }

    /* ------------------------------------------------------------------ *
     * Theme — dark mode detection.
     *
     * DSH signals the active palette by toggling `data-ds-dark-theme` on
     * `<body>` (the boot script sets it before any plugin runs, and the
     * shipped palette keys every dark token off that same attribute), so the
     * attribute — NOT `prefers-color-scheme` — is the authoritative signal:
     * the user can pick "dark" while the OS is light, and the media query
     * would then disagree with the palette actually in force.
     *
     * `useSyncExternalStore` keeps the reactive contract explicit: the store
     * notifies subscribers through a MutationObserver, so flipping the theme
     * in settings re-colours the popover live, with no reload.
     * ------------------------------------------------------------------ */
    const RAIL_BASE_LIGHT = '#e8e7e8';   // measured from the original recording
    const RAIL_BASE_DARK = '#232324';    // --dsw-alias-bg-layer-1 (inset groove)
    /* 22% of the level colour tinted over the rail base — the same mix the
     * light theme always used, just over a theme-correct base. */
    const TRACK_TINT = 0.22;

    function isDarkNow() {
      try {
        return typeof document !== 'undefined'
          && document.body != null
          && document.body.hasAttribute('data-ds-dark-theme') === true;
      } catch (e) { return false; }
    }
    function subscribeTheme(notify) {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined'
        || document.body == null) return () => {};
      const mo = new MutationObserver(notify);
      mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      return () => mo.disconnect();
    }
    /** Reactive dark-mode flag for the component tree. */
    function useDarkTheme() {
      return useSyncExternalStore(subscribeTheme, isDarkNow, () => false);
    }
    /** The rail's un-filled base colour for the active theme. */
    function railBase(dark) {
      return dark ? RAIL_BASE_DARK : RAIL_BASE_LIGHT;
    }
    /** Tinted track: the base mixed 22% toward the current level's fill. */
    function trackFor(fill, dark) {
      return mixHex(railBase(dark), fill, TRACK_TINT);
    }

    function rank(id) {
      const i = EFFORT_ORDER.indexOf(String(id).toLowerCase());
      return i === -1 ? 50 : i;
    }
    /** Sort the model's declared efforts into Codex ladder order. */
    function sortEfforts(list) {
      return [...(list || [])].sort((a, b) => rank(a.id) - rank(b.id));
    }
    /** Localised label for an effort; falls back to the model's own name. */
    function effortLabel(effort, t) {
      if (!effort) return '';
      const key = EFFORT_KEY[String(effort.id).toLowerCase()];
      if (key) {
        const translated = t(key);
        // locale lookup echoes the key back when it is missing
        if (translated && translated !== key) return translated;
      }
      return effort.name || effort.id;
    }

    /* ------------------------------------------------------------------ *
     * Geometry — measured from the original recording.
     *
     * Verified cross-checks (recorded px -> CSS px, ratio 1.385):
     *   card height    144 -> 104.0   |  rail top    91 -> 65.7
     *   rail height     36 ->  26.0   |  rail width 346 -> 249.8
     *   knob diameter   40 ->  28.9   |  dot diameter 5 ->   3.6
     *   list row pitch  42.6 -> 30.8  |  list font   14 ->  10.1 cap
     * ------------------------------------------------------------------ */
    const CSS = `
.${P}-root{position:relative;display:inline-flex;min-width:0;font-family:var(--dsw-font-family);font-size:14px;letter-spacing:0}
.${P}-root *{box-sizing:border-box;corner-shape:round}
.${P}-root button{font:inherit;cursor:pointer;border:0;background:transparent;color:inherit}

/* ---------- trigger (collapsed seat) ---------- */
.${P}-trigger{display:inline-flex;align-items:center;gap:5px;max-width:250px;height:28px;padding:0 7px;border-radius:8px;color:var(--dsw-alias-label-caption);font-size:13px!important}
.${P}-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.${P}-trigger:disabled{cursor:default;opacity:.55}
.${P}-trigger:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.${P}-bolt{width:14px;height:16px;flex:none;color:var(--dsw-alias-label-primary);fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round}
.${P}-trigger.fast .${P}-bolt{fill:currentColor;stroke-width:.7}
.${P}-iconSmall{width:14px;height:14px;flex:none}
.${P}-caption{display:var(--dsh-composer-model-text-display,inline);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.${P}-triggerEffort{color:var(--${P}-ink,var(--dsw-alias-label-caption));transition:color .2s ease}
.${P}-compact{display:var(--dsh-composer-model-icon-display,none)}
.${P}-chev{width:12px;height:12px;flex:none;color:var(--dsw-alias-label-caption);transition:transform .12s ease}
.${P}-trigger[aria-expanded=true] .${P}-chev{transform:rotate(180deg)}

/* ---------- the Fast tooltip ----------
   BUG (fixed here): this layer used to be a child of the ⚡ button — i.e. INSIDE
   the popover — and position:fixed alone could not free it. The popover
   paints the shipped menu material
   backdrop-filter: var(--dsw-menu-backdrop-filter) = blur(40px) saturate(150%),
   and a non-none backdrop-filter makes that element the CONTAINING BLOCK for
   every fixed/absolute descendant. So the viewport coordinates positionTip
   computed were re-interpreted against the POPOVER's box (measured in a real
   browser: a wanted top of 479 landed at 1023 = 544 popover top + 479) and
   overflow:hidden then clipped the layer away. Hover *did* flip opacity to 1
   and visibility to visible — nothing was ever painted, which is exactly the
   "悬停无法显示" symptom.
   FIX: render the tooltip as a SIBLING of the popover under .cmes-root.
   That box carries no transform / filter / backdrop-filter, so position:fixed
   resolves against the viewport again (probe-verified: a fixed box inside the
   popover reports the popover origin, one inside the root reports 0,0).
   The tooltip is therefore no longer a descendant of the button, so the old
   .cmes-fast:hover [role=tooltip] rule could never fire; visibility is a
   .show class driven by pointer enter/leave + focus/blur instead. */
.${P}-tip{position:fixed;z-index:1400;padding:7px 12px;white-space:nowrap;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-elevation-panel);border-radius:10px;font-size:12px;line-height:17px;text-align:center;color:var(--dsw-alias-label-primary);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(2px);transition:opacity .12s ease,transform .12s ease,visibility 0s .12s}
.${P}-tip.show{opacity:1;visibility:visible;transform:translateY(0);transition:opacity .12s ease,transform .12s ease,visibility 0s}
/* the reference tooltip is a two-line card: a heavier title over a muted
   subtitle. The "visual only" disclosure stays for assistive tech only, so the
   card keeps the reference's two-line shape. */
.${P}-tip span{display:block;color:var(--dsw-alias-label-secondary)}
.${P}-tip .${P}-tipTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px}

/* ---------- popover ---------- */
.${P}-popover{position:fixed;bottom:var(--${P}-bottom,40px);left:var(--${P}-left,12px);width:272px;max-width:calc(100vw - 24px);height:var(--${P}-height,104px);max-height:calc(100vh - var(--${P}-bottom,40px) - 12px);padding:0;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));border-radius:14px;box-shadow:var(--dsw-elevation-panel);backdrop-filter:var(--dsw-menu-backdrop-filter);z-index:1100;overflow:hidden;transform-origin:bottom left;transition:opacity .18s ease,transform .18s ease,height .2s cubic-bezier(.2,.8,.2,1),visibility 0s}
.${P}-popover.closed{opacity:0;pointer-events:none;visibility:hidden;transform:translateY(5px) scale(.98);transition-delay:0s,0s,0s,.18s}
.${P}-popover.peak{--dsw-elevation-stroke-color:rgba(145,78,246,.28)}

/* ---------- panes ---------- */
.${P}-pane{position:absolute;left:0;right:0;bottom:0;opacity:1;transform:translateY(0);transition:opacity .14s ease,transform .2s ease,visibility 0s}
.${P}-pane.hidden{opacity:0;pointer-events:none;visibility:hidden;transform:translateY(5px);transition-delay:0s,0s,.14s}

/* ---------- effort pane ---------- */
.${P}-main{height:104px}
.${P}-tool{position:absolute;top:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:8px;color:var(--dsw-alias-label-caption)}
.${P}-tool:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-fast{left:7px}
.${P}-reset{right:7px}
.${P}-tool svg{width:16px;height:16px}
.${P}-fast.active{color:var(--${P}-accent,#3988f6)}
.${P}-popover.peak .${P}-fast.active{color:var(--${P}-accentPeak,#9b48eb)}
.${P}-modelLink{position:absolute;left:43px;right:43px;top:8px;height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 4px;border-radius:5px;transition:opacity .2s ease}
.${P}-modelLink:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-heading{display:flex;gap:3px;justify-content:center;align-items:center;max-width:100%;height:20px;color:var(--${P}-ink,#3989e9);font-size:14px;line-height:20px;white-space:nowrap;transition:color .2s ease}
.${P}-heading svg{width:10px;height:10px;color:var(--dsw-alias-label-caption)}
.${P}-modelName{display:block;max-width:100%;height:18px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.${P}-warning{position:absolute;left:29px;right:29px;top:20px;text-align:center;line-height:18px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s ease}
.${P}-warning span{display:inline-block;background:linear-gradient(90deg,var(--${P}-warnHi,#a965dd) 0%,var(--${P}-warnHi,#a965dd) 42%,var(--${P}-warnLo,#653780) 50%,var(--${P}-warnHi,#a965dd) 58%,var(--${P}-warnHi,#a965dd) 100%);background-size:300% 100%;background-position:0 0;background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.${P}-popover.message .${P}-modelLink,.${P}-popover.message .${P}-tool{opacity:0;pointer-events:none}
.${P}-popover.message .${P}-warning{opacity:1}
.${P}-popover.message .${P}-warning span{animation:${P}-sweep 1.1s linear .2s 1 both}
@keyframes ${P}-sweep{from{background-position:100% 0}to{background-position:0 0}}

/* ---------- rail (the measured slider) ----------
   The track itself is tinted toward the current level's fill, so the rail
   reads as "this level" even where it is not yet filled. The fill and track
   colours are stamped per level by the component, over the theme's own rail
   base (measured #e8e7e8 in light, the inset #232324 groove in dark). */
.${P}-rail{position:absolute;left:12px;right:12px;top:65px;height:26px;border-radius:16px;background:var(--${P}-track,#e8e7e8);touch-action:none;cursor:pointer;transition:background .25s ease}
/* GRAB AREA — the visible knob is 30px tall while the track is only 26px, so
   the knob's 2px overhang used to be a dead zone: pointer-events:none on the
   puck meant a press there hit the PANE, no pointerdown reached the rail and the
   drag never started. That is worst at the far-right stop, where the knob is the
   only target left on the track ("按住无法滑动"). Fixed STRUCTURALLY, by
   widening the track's own hit box: this transparent pad covers the whole
   overhang (and 4px more on each side). Because it is a box of the rail, hit
   tests land on the rail itself.
   The knob deliberately stays pointer-events:none: the pad already covers
   everything the knob overhangs, and keeping the puck transparent to input
   means the event TARGET never changes while the value slides under the
   cursor — one stable target for the whole gesture, which is exactly what
   keeps a drag from being interrupted part-way. */
.${P}-rail::before{content:"";position:absolute;inset:-6px -3px;border-radius:20px}
.${P}-rail:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#3989e9);outline-offset:2px}
.${P}-fill,.${P}-sparks{position:absolute;inset:0 auto 0 0;width:calc((100% - 30px)*var(--${P}-pos,0) + 15px);border-radius:13px 0 0 13px;overflow:hidden;pointer-events:none;transition:width .18s cubic-bezier(.2,.8,.2,1)}
.${P}-fill{background:var(--${P}-fill,#3a83f7);transition:width .18s cubic-bezier(.2,.8,.2,1),background .25s ease}
.${P}-popover.peak .${P}-fill{background:var(--${P}-peakGradient,linear-gradient(90deg,#3b83f6 0%,#3b82f6 10%,#3d7bf3 20%,#4c75f4 30%,#6473fa 40%,#8d80fc 50%,#9375fd 55%,#9d78fd 60%,#a779fe 65%,#a476fe 70%,#9e73fe 75%,#9166fe 80%,#845af9 85%,#7d55f6 93%,#7448ee 100%));background-size:155% 100%;animation:${P}-colorflow 3.8s ease-in-out infinite alternate}
.${P}-popover.peak .${P}-fill::before{content:"";position:absolute;inset:-10px -40px;background:linear-gradient(100deg,transparent 18%,#ffffff08 35%,#ffffff30 48%,#ffffff06 66%,transparent 84%);animation:${P}-shimmer 4.5s ease-in-out infinite alternate}
@keyframes ${P}-colorflow{from{background-position:0 0}to{background-position:100% 0}}
@keyframes ${P}-shimmer{from{transform:translateX(-45%)}to{transform:translateX(45%)}}
.${P}-dot{position:absolute;top:11px;left:calc((100% - 30px)*var(--${P}-tick,0) + 15px);width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--${P}-dot,#b6b6b8);pointer-events:none;transition:background .18s ease,opacity .18s ease,transform .14s ease}
/* a passed tick sits ON the fill, so it takes the knob's own colour: that is
   the one surface guaranteed to read against every level's fill in both
   themes (the light knob is white, the dark knob is #f9fafb). */
.${P}-dot.passed{background:var(--${P}-dotPassed,rgba(255,255,255,.55))}
.${P}-dot.hovered{transform:scale(1.75)}
.${P}-popover.peak .${P}-dot{opacity:0}
.${P}-sparks{opacity:0;transition:width .18s cubic-bezier(.2,.8,.2,1),opacity .25s ease}
.${P}-popover.peak .${P}-sparks,.${P}-popover.fast-mode .${P}-sparks{opacity:1}
.${P}-sp{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;opacity:var(--b,1);transform:scale(var(--b,1));animation:${P}-drift var(--dur,3s) linear infinite;animation-delay:var(--delay,0s)}
@keyframes ${P}-drift{0%{left:-4%;opacity:0}6%{opacity:var(--b,1)}94%{opacity:var(--b,1)}100%{left:104%;opacity:0}}

/* ---------- arrival bloom ----------
   Reaching the far-right stop fires a ONE-SHOT burst of motes out of the knob,
   the way the original app does at Ultra. Measured from the recording
   (523px capture / 1.468 = CSS px): six violet motes leave the knob edge at
   r≈19px, sit at r≈33px one frame later, r≈44px the frame after, and are gone
   by the third — so the whole flourish lives ~0.5s and never loops.
   Two shape facts are taken from the measurement, not invented:
     • every mote fanned LEFTWARD (angles ±100°..±175°). That is what fits —
       the knob parks against the card's right edge, so a full circle would be
       half-clipped — and it is why the burst reads as coming OUT of the track;
     • the motes travel further horizontally (rx≈44px) than vertically
       (ry≈22px), matching the measured ellipse.
   Per-mote offsets and lifetimes are stamped inline from buildBloom, so the
   burst is deterministic and a re-render never reshuffles a burst in flight. */
.${P}-bloom{position:absolute;left:calc(100% - 15px);top:13px;width:0;height:0;pointer-events:none;z-index:3}
.${P}-bp{position:absolute;left:0;top:0;width:var(--sz,4px);height:var(--sz,4px);margin-top:calc(var(--sz,4px) * -0.5);margin-left:calc(var(--sz,4px) * -0.5);border-radius:50%;background:var(--${P}-mote,#c9a9fb);box-shadow:0 0 6px var(--${P}-mote,#c9a9fb);opacity:0;animation:${P}-burst var(--bd,.62s) cubic-bezier(.15,.72,.25,1) var(--bdel,0s) 1 both}
@keyframes ${P}-burst{
  0%{opacity:0;transform:translate(var(--x0,0px),var(--y0,0px)) scale(.4)}
  18%{opacity:var(--bmax,.95)}
  100%{opacity:0;transform:translate(var(--x1,0px),var(--y1,0px)) scale(.5)}
}
/* one soft ring rides out with the motes: it is what makes the burst read as a
   bloom rather than as scattered dots */
.${P}-halo{position:absolute;left:0;top:0;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:radial-gradient(circle,var(--${P}-mote,#c9a9fb) 0%,transparent 66%);opacity:0;animation:${P}-haloRing .5s ease-out 1 both}
@keyframes ${P}-haloRing{0%{opacity:.55;transform:scale(.24)}100%{opacity:0;transform:scale(1.55)}}
.${P}-knob{position:absolute;left:calc((100% - 30px)*var(--${P}-pos,0));top:-2px;width:30px;height:30px;border-radius:50%;background:var(--${P}-knob,var(--dsw-alias-bg-layer-2,#f8f8f8));box-shadow:var(--dsw-elevation-panel),0 1px 3px var(--${P}-knobShadow,rgba(0,0,0,.10));border:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));pointer-events:none;z-index:2;transform:scale(1);transform-origin:50% 50%;transition:left .18s cubic-bezier(.2,.8,.2,1),transform .34s cubic-bezier(.34,1.56,.64,1)}
/* PRESS / RELEASE DEFORMATION.
   Holding the knob swells it; letting go springs it back through the overshoot
   curve above. Scale ONLY — no halo ring, no shadow bloom — so the press reads
   as the knob being picked up rather than as a glow lighting up. The transform
   origin is the knob's own centre, so the silhouette grows symmetrically about
   the value it points at and its layout box — the thing the finger-drag maths
   reads — never moves. */
.${P}-rail.dragging .${P}-knob{transform:scale(1.16)}
/* while dragging, the knob must track the pointer with NO left transition and
   NO snapping — snapping happens on release. The transform transition stays so
   the press itself still deforms smoothly. */
.${P}-rail.dragging .${P}-knob{transition:transform .14s cubic-bezier(.2,.9,.3,1.2)}
.${P}-rail.dragging .${P}-fill{transition:none}
.${P}-rail.dragging{cursor:grabbing}
.${P}-noeffort{position:absolute;top:65px;left:12px;right:12px;text-align:center;font-size:12px;line-height:26px;color:var(--dsw-alias-label-secondary)}
@media (prefers-reduced-motion:reduce){
  .${P}-sp{animation-duration:calc(var(--dur,3s) * 2.6)}
  /* the arrival burst is pure decoration; collapse it instead of slowing it,
     because a slow radial burst reads as a rendering glitch */
  .${P}-bp{animation-duration:.01s;animation-delay:0s}
  .${P}-halo{animation-duration:.01s}
  /* the press keeps a smaller, transition-free swell: motion without movement */
  .${P}-rail.dragging .${P}-knob{transform:scale(1.06);transition:none}
}

/* ---------- model pane: two-level drill-down ----------
   Page 1 lists providers (each with the currently selected model name on the
   right + a chevron); clicking one slides page 2 in — that provider's models
   with a search box and a back button. This replaces the earlier
   collapsible-group list, which had a contradictory open/closed state model.
   Geometry follows the reference implementation (panel 272 wide, provider row
   41, model row 39, list max-height 252). */
/* Issue 2 fix: the pane is anchored with bottom:0 but no top, so its height is
   content-driven. That made the models pane's height:100% resolve to auto, the
   whole flex chain lost its definite height, and a long provider list simply
   overflowed the popover and got clipped with nothing to scroll. Pinning top:0
   gives the pane a definite height so min-height:0 on the descendants can
   actually hand the leftover space to the row list. */
.${P}-models{top:0;height:100%;padding:10px;overflow:hidden;display:flex;flex-direction:column}
.${P}-viewport{position:relative;overflow:hidden;transition:height .3s cubic-bezier(.32,.72,.28,1);flex:1 1 auto;min-height:0}
/* Each page is a full-height flex column so its inner list can scroll.
   Without this the page is content-sized and the LAST row gets clipped by the
   viewport's overflow:hidden with no way to scroll to it (issue 2). */
.${P}-page{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;transition:transform .3s cubic-bezier(.32,.72,.28,1)}
.${P}-page.slot1{transform:translateX(0)}
.${P}-page.slot2{transform:translateX(100%)}
.${P}-viewport.view2 .${P}-page.slot1{transform:translateX(-100%)}
.${P}-viewport.view2 .${P}-page.slot2{transform:translateX(0)}
.${P}-sec{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#9aa0ab);padding:4px 8px 8px}
/* page 1's provider list needs its OWN scroller: the reference learned that a
   clipped provider row is unreachable because page 1 has no scroll container. */
.${P}-rows{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 2px 4px}
.${P}-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;padding:10px;border-radius:10px;cursor:pointer;text-align:left;user-select:none}
.${P}-row:hover,.${P}-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
/* Issue 1: a small blue dot marks the provider that holds the CURRENT model,
   so the active group is visible without opening every provider. It is the
   second item (after the name), so it sits at the right end of the row. */
.${P}-rowDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--${P}-accent,#3a83f7);box-shadow:0 0 0 3px var(--${P}-accentHalo,rgba(58,131,247,.16))}
/* The provider row is name + dot + chevron: the name absorbs the free space,
   which pushes the dot and the chevron to the right edge. */
.${P}-rowName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-rowChev{width:11px;height:11px;flex:none;color:var(--dsw-alias-label-tertiary,#9aa0ab)}
.${P}-head{flex:none;display:flex;align-items:center;gap:6px;padding:2px 4px 8px}
.${P}-back{width:26px;height:26px;flex:none;display:grid;place-items:center;background:transparent;border:0;border-radius:8px;color:var(--dsw-alias-label-tertiary,#9aa0ab);cursor:pointer}
.${P}-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-back svg{width:12px;height:12px}
.${P}-title{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-search{flex:none;display:flex;align-items:center;gap:8px;margin:0 4px 6px;padding:7px 10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-interactive-bg-hover));border-radius:10px}
.${P}-search svg{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-caption,#7c8290)}
.${P}-search input{flex:1 1 auto;min-width:0;background:transparent;border:0;outline:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.${P}-list{flex:1 1 auto;min-height:0;overflow-y:auto;max-height:252px;overscroll-behavior:contain;padding:0 2px 4px}
.${P}-model{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;padding:9px 10px;border-radius:9px;cursor:pointer;text-align:left;user-select:none}
.${P}-model:hover,.${P}-model:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.${P}-modelName{display:flex;align-items:center;gap:6px;min-width:0}
.${P}-modelName>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-model.na .${P}-modelName>span:first-child{color:var(--dsw-alias-label-tertiary,#9aa0ab)}
.${P}-cnt{flex:none;font-size:10.5px;color:var(--dsw-alias-label-caption,#7c8290);background:var(--dsw-alias-interactive-bg-hover);border-radius:6px;padding:1px 6px}
.${P}-model.na .${P}-cnt{color:var(--dsw-alias-state-warn-label,#6b5b4a)}
.${P}-ck{width:15px;height:15px;flex:none;color:var(--dsw-alias-label-primary);opacity:0}
.${P}-model.sel .${P}-ck{opacity:1}
.${P}-empty{color:var(--dsw-alias-label-tertiary,#9aa0ab);font-size:13px;padding:14px 10px;text-align:center}
.${P}-failure{border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;line-height:1.6;padding:4px 8px;margin:0 2px 3px;word-break:break-word}
.${P}-sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* ---------- dark theme ----------
   DSH toggles data-ds-dark-theme on <body>; only the static chrome below
   needs a palette swap, because the fills, inks and track are stamped per
   level in JS from the EFFORT_*_DARK tables. Surfaces, borders and labels
   already come from --dsw-alias-* tokens, which flip on their own.
   Values follow the shipped dark tokens:
     label-primary #f9fafb | business #7aaaff | bg-layer-1 #232324 */
body[data-ds-dark-theme] .${P}-root{
  /* the knob becomes a bright puck: the token it inherits in dark (#2c2c2e)
     would be near-identical to the #232324 track and would vanish */
  --${P}-knob:#f9fafb;
  --${P}-knobShadow:rgba(0,0,0,.45);
  /* a passed tick matches the knob, so it reads on every dark fill */
  --${P}-dotPassed:#f9fafb;
  /* accents lift to the shipped dark business/peak hues */
  --${P}-accent:#7aaaff;
  --${P}-accentPeak:#c39bff;
  --${P}-accentHalo:rgba(122,170,255,.20);
  /* the quota shimmer sweeps a LIGHT band on a dark card: the light theme's
     dark band would dip below the card contrast and vanish */
  --${P}-warnHi:#c39bff;
  --${P}-warnLo:#f3e6ff;
  /* the Ultra gradient keeps its hue arc but every stop clears the track */
  --${P}-peakGradient:linear-gradient(90deg,#3e89ff 0%,#438bff 10%,#518dff 20%,#668bff 30%,#7c8aff 40%,#9386ff 50%,#a084ff 55%,#a785ff 60%,#b085ff 65%,#b087ff 70%,#af8bff 75%,#ae8fff 80%,#ae91ff 85%,#af95ff 93%,#b296fe 100%);
  /* Ultra's elevation stroke reads at dark contrast */
  --dsw-elevation-stroke-color:rgba(176,133,255,.45);
}
`;

    /* ------------------------------------------------------------------ *
     * Icons (hand-drawn paths; no third-party assets)
     * ------------------------------------------------------------------ */
    const ICON = {
      chevron: 'm9 18 6-6-6-6',
      down: 'm6 9 6 6 6-6',
      check: 'm20 6-11 11-5-5',
      reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
      close: 'M6 6l12 12M18 6L6 18',
      search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
      model: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
      bolt: 'M14.4 2Q16 .2 15.8 2.5L15.1 8.5H20.5Q22 8.5 21 9.8L10.7 21.7Q9 23.4 9.2 21.2L10 14.2H4.2Q2.6 14.2 3.6 12.9L14.4 2Z'
    };
    function icon(name, cls) {
      return h('svg', {
        className: cls || `${P}-icon`, viewBox: '0 0 24 24', 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round'
      }, h('path', { d: ICON[name] || ICON.chevron }));
    }

    /* ------------------------------------------------------------------ *
     * Sparkle dust — deterministic (no Math.random), so re-renders never
     * reshuffle. Phase uses a low-discrepancy sequence; height is a separate
     * hash so dots never queue into a diagonal.
     * ------------------------------------------------------------------ */
    const PHI = 0.6180339887498949;
    function hash01(n) {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    }
    function buildSparkles(count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const b = 0.5 + 0.5 * hash01(i * 7 + 3);
        out.push({
          key: i,
          top: (8 + 84 * hash01(i * 13 + 5)).toFixed(1) + '%',
          b: b.toFixed(2),
          dur: (1.6 + 2.4 * hash01(i * 3 + 11)).toFixed(2) + 's',
          delay: (-(i * PHI % 1) * 4).toFixed(2) + 's'
        });
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * Arrival bloom — the one-shot burst fired when the knob lands on the
     * far-right stop. Same determinism rules as the dust above: a hash picks
     * every angle, radius, size and lifetime, so a re-render mid-burst cannot
     * reshuffle it and two sessions render the identical flourish.
     *
     * Geometry follows the measurement (see the CSS block): motes start at the
     * knob's edge, die at rx≈44px / ry≈22px, are 3-5px across, and fan
     * leftward-only so the burst stays inside the card at every width.
     * ------------------------------------------------------------------ */
    const BLOOM_COUNT = 18;
    function buildBloom(count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        /* Fan the motes across the LEFT half-plane only (the knob parks against
           the card's right edge, so a full circle would be half-clipped), and
           push them away from the pure-horizontal band: a mote that travels
           straight left is drawn over the vivid fill and disappears, while one
           that climbs or dips lands on the card's pale surface and reads.
           Alternating sides keeps the burst symmetric like the recording. */
        const side = i % 2 === 0 ? 1 : -1;                  // +1 down, -1 up
        const t = hash01(i * 5 + 2);
        const deg = side > 0
          ? 108 + 56 * t                                    // 108..164 down-left
          : 180 + (72 - 56 * t);                            // 196..252 up-left
        const ang = deg * Math.PI / 180;
        const near = 9 + 5 * hash01(i * 11 + 7);            // leaves the knob edge
        const far = 0.72 + 0.55 * hash01(i * 17 + 3);       // share of the reach
        const rx = 34 + 12 * hash01(i * 23 + 13);           // 34..46px across
        const ry = 20 + 9 * hash01(i * 29 + 19);            // 20..29px up/down
        out.push({
          key: i,
          x0: (Math.cos(ang) * near).toFixed(1) + 'px',
          y0: (Math.sin(ang) * near).toFixed(1) + 'px',
          x1: (Math.cos(ang) * rx * far).toFixed(1) + 'px',
          y1: (Math.sin(ang) * ry * far).toFixed(1) + 'px',
          sz: (3.4 + 2.6 * hash01(i * 31 + 5)).toFixed(1) + 'px',
          bmax: (0.70 + 0.30 * hash01(i * 37 + 23)).toFixed(2),
          bd: (0.6 + 0.3 * hash01(i * 41 + 11)).toFixed(2) + 's',
          bdel: (0.05 * hash01(i * 43 + 17)).toFixed(3) + 's'
        });
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * Fast toggle — per-conversation persistence.
     *
     * The ⚡ toggle used to live only in component state. The seat is
     * session-scoped, so switching conversations and coming back REMOUNTED the
     * component and the toggle silently fell back to "off" ("选 Fast 后切走再
     * 切回来又变回默认"). It is a per-conversation preference, so it is stored
     * per session and restored on mount.
     *
     * Key shape follows the host's own convention
     * (`dsh.conversation.<sessionId>`, `dsh.sidebar-right.v1`, …):
     *   dsh.codex-effort-selector.fast.v1.<sessionId>
     *
     * Two layers on purpose:
     *   - an in-memory mirror makes a switch inside one app run independent of
     *     storage entirely (and keeps the fix working where storage is blocked);
     *   - localStorage carries it across restarts.
     * This plugin is fail-open, so every storage access is guarded: a failure
     * only costs the restart, never the composer.
     * ------------------------------------------------------------------ */
    const FAST_STORE_PREFIX = 'dsh.codex-effort-selector.fast.v1.';
    const fastMemory = new Map();
    function readFast(sessionId) {
      if (!sessionId) return false;
      if (fastMemory.has(sessionId)) return fastMemory.get(sessionId);
      try {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem(FAST_STORE_PREFIX + sessionId) === '1';
      } catch { return false; }
    }
    function writeFast(sessionId, on) {
      if (!sessionId) return;
      fastMemory.set(sessionId, on);
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(FAST_STORE_PREFIX + sessionId, on ? '1' : '0');
      } catch { /* storage disabled — the in-memory mirror still holds it */ }
    }

    /* ================================================================== *
     * Selector component
     * ================================================================== */
    function Selector({ directory, load, select, available, locked, t, renderSlot, sessionId }) {
      const state = useSyncExternalStore(
        fn => directory.subscribe(fn),
        () => directory.getSnapshot()
      );

      const [open, setOpen] = useState(false);
      const [present, setPresent] = useState(false);
      const [pane, setPane] = useState('effort');
      /* Fast is restored from this session's stored preference on mount, so a
       * conversation switch (which remounts the seat) no longer resets it. */
      const [fast, setFastState] = useState(() => readFast(sessionId));
      const [preview, setPreview] = useState(null);
      const [hovered, setHovered] = useState(-1);
      const [dragging, setDragging] = useState(false);
      const [message, setMessage] = useState(false);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [query, setQuery] = useState('');
      const [highlight, setHighlight] = useState(0);
      /* tooltip visibility is state now, not `:hover` CSS: the tooltip has to
       * live OUTSIDE the popover to escape the backdrop-filter containing block,
       * so it is no longer a descendant of the ⚡ button and no descendant
       * selector can reach it (see the CSS block for the full diagnosis). */
      const [tipOn, setTipOn] = useState(false);
      /* Bumped when the knob ARRIVES on the far-right stop. Used as the bloom
       * layer's React key, so each arrival remounts it and the CSS animation
       * replays from zero instead of resuming a finished one. */
      const [bloom, setBloom] = useState(0);
      /* Two-level drill-down (replaces the old collapsible-group list).
       * `view` is 1 (provider list) or 2 (that provider's models). */
      const [view, setView] = useState(1);
      const [subProvider, setSubProvider] = useState(null);

      const rootRef = useRef(null);
      const popupRef = useRef(null);
      const railRef = useRef(null);
      const triggerRef = useRef(null);
      const searchRef = useRef(null);
      const tipRef = useRef(null);
      const fastBtnRef = useRef(null);
      const previewRef = useRef(null);
      const dragRef = useRef(false);
      /* which pointerId owns the active drag (multi-pointer safety) */
      const pointerRef = useRef(null);
      const busyRef = useRef(false);
      const pendingRef = useRef(null);
      const mountedRef = useRef(true);
      const timersRef = useRef([]);
      const latest = useRef({});
      /* The index the popover last showed, so the bloom fires on the ARRIVAL
       * transition only — not on every render that happens to sit at the end. */
      const seenIndexRef = useRef(null);
      /* mirrors `fast` for the writer below, and remembers which session the
       * mounted value belongs to (the seat may be reused across sessions) */
      const fastRef = useRef(fast);
      fastRef.current = fast;
      const fastSessionRef = useRef(sessionId);

      /* Every Fast change is written through, so it survives the remount that a
       * conversation switch causes. Accepts a value or an updater, like the
       * setState it wraps. */
      const setFast = next => {
        const value = typeof next === 'function' ? next(fastRef.current) : next;
        if (value === fastRef.current) return;
        fastRef.current = value;
        setFastState(value);
        writeFast(sessionId, value);
      };

      /* ---------- derive catalog state ---------- */
      const selection = state.pending || state.current;
      const groups = state.groups || [];
      const group = groups.find(g => g.id === selection?.provider);
      const model = group?.models.find(m => m.id === selection?.model);
      const efforts = sortEfforts(model?.reasoning?.efforts);
      const savedEffort = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort;
      const displayed = preview ?? savedEffort;
      const index = Math.max(0, efforts.findIndex(e => e.id === displayed));
      const fraction = efforts.length > 1 ? index / (efforts.length - 1) : 0;
      /* Ultra styling keys on the *id*, never on "is the last stop" — otherwise
       * a two-level model (light/high) would paint its top stop violet. */
      const peak = isPeakId(displayed);
      /* Per-theme palette: every fill/ink/track value below is picked for the
       * active theme, so a live theme switch re-colours without a remount. */
      const dark = useDarkTheme();
      const modelName = model?.name || selection?.model || t('choose');
      const disabled = Boolean(locked || !available);
      const sparkles = useMemo(() => buildSparkles(22), []);
      const bloomMotes = useMemo(() => buildBloom(BLOOM_COUNT), []);
      const isLastStop = efforts.length > 1 && index === efforts.length - 1;
      const tipShown = tipOn && open && pane === 'effort';

      latest.current = { open: present, fast, peak, pane, efforts, index, savedEffort, view };

      /* Place the Fast tooltip in the VIEWPORT, above its button.
       * Only correct because the tooltip now lives under `.cmes-root`; while it
       * sat inside the popover these coordinates were resolved against the
       * popover and the layer was clipped away. */
      function positionTip() {
        const tip = tipRef.current;
        const btn = fastBtnRef.current;
        if (!tip || !btn) return;
        const r = btn.getBoundingClientRect();
        const tw = tip.offsetWidth || 120;
        const th = tip.offsetHeight || 44;
        const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8));
        tip.style.left = `${left}px`;
        tip.style.top = `${Math.max(8, r.top - th - 7)}px`;
      }

      /* ---------- effects ---------- */
      useEffect(() => { if (available) load(); }, [available, load]);

      /* If the host REUSES this component instance for another session (instead
       * of remounting it), adopt that session's stored Fast preference. On a
       * real remount the useState initializer already did it, and this effect
       * sees no change. */
      useEffect(() => {
        if (fastSessionRef.current === sessionId) return;
        fastSessionRef.current = sessionId;
        const stored = readFast(sessionId);
        fastRef.current = stored;
        setFastState(stored);
      }, [sessionId]);

      useLayoutEffect(() => {
        if (open) { setPresent(true); return; }
        const timer = setTimeout(() => setPresent(false), 180);
        return () => clearTimeout(timer);
      }, [open]);

      useEffect(() => {
        mountedRef.current = true;
        return () => {
          mountedRef.current = false;
          timersRef.current.forEach(clearTimeout);
        };
      }, []);

      /* The tooltip is measured AFTER it is in the DOM. Positioning it in the
       * hover handler was a second, hidden defect: on the very first hover the
       * layer had never been laid out, so `offsetWidth/offsetHeight` fell back
       * to the placeholder numbers and the card was placed with a guessed size
       * and guessed height. A layout effect always sees real metrics. */
      useLayoutEffect(() => {
        if (!tipShown) return;
        positionTip();
        const settle = () => positionTip();
        window.addEventListener('resize', settle);
        document.addEventListener('scroll', settle, true);
        return () => {
          window.removeEventListener('resize', settle);
          document.removeEventListener('scroll', settle, true);
        };
      }, [tipShown]);

      /* the tooltip must never outlive the state that anchors it */
      useEffect(() => { if (!open) setTipOn(false); }, [open]);
      useEffect(() => { if (pane !== 'effort') setTipOn(false); }, [pane]);

      /* ARRIVAL BLOOM — fires on the transition INTO the far-right stop while
       * the popover is open. A drag, a track click, `End`, or the reset button
       * all funnel through `index`, so every route to the end blooms exactly
       * once. Opening the popover already parked at the end must NOT bloom,
       * which is why the first observed index of each open is only recorded. */
      useEffect(() => {
        if (!open) { seenIndexRef.current = null; return; }
        if (seenIndexRef.current === null) { seenIndexRef.current = index; return; }
        const arrived = index === efforts.length - 1 && seenIndexRef.current !== index;
        seenIndexRef.current = index;
        if (arrived) setBloom(n => n + 1);
      }, [index, open, efforts.length]);

      /* THE GESTURE IS OWNED BY THE DOCUMENT, not by the rail.
       *
       * Pointer capture alone is not a reliable owner: it is dropped whenever
       * the capturing element is replaced, the press starts a native drag or a
       * text selection, the pointer leaves the window, or the browser decides to
       * take the gesture away (all of which fire `pointercancel` /
       * `lostpointercapture`). When that happens the rail simply stops hearing
       * `pointermove` and the drag freezes mid-way — reported as "按住拖到一半
       * 就变成无法选中".
       *
       * So while a drag is live we listen on the DOCUMENT in the capture phase.
       * Capture-phase listeners on the document see every pointer event
       * regardless of capture retargeting, so the drag keeps tracking the
       * pointer even if the rail itself never receives the event. The rail's own
       * handler becomes hover-only (the drag branch returns early), so each
       * pointermove is applied exactly once. */
      useEffect(() => {
        if (!dragging) return;
        const owns = e => pointerRef.current === null || e.pointerId === pointerRef.current;
        const move = e => { if (owns(e) && dragRef.current) applyPointer(e.clientX); };
        const up = e => { if (owns(e) && dragRef.current) finish(e); };
        const cancel = e => { if (owns(e) && dragRef.current) cancelDrag(); };
        /* A release outside the window never reaches the document; focus loss is
         * the only signal we get, and the gesture must not stay latched. */
        const blur = () => { if (dragRef.current) finish(); };
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', up, true);
        document.addEventListener('pointercancel', cancel, true);
        window.addEventListener('blur', blur);
        return () => {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', up, true);
          document.removeEventListener('pointercancel', cancel, true);
          window.removeEventListener('blur', blur);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [dragging]);

      /* peak-entry flourish: show the warning, then settle */
      function enterPeak() {
        timersRef.current.forEach(clearTimeout);
        setMessage(true);
        timersRef.current = [setTimeout(() => { if (mountedRef.current) setMessage(false); }, 1800)];
      }
      function showEffort(id) {
        const before = previewRef.current ?? savedEffort;
        previewRef.current = id;
        setPreview(id);
        if (isPeakId(id) && !isPeakId(before)) enterPeak();
        else if (!isPeakId(id)) {
          timersRef.current.forEach(clearTimeout);
          setMessage(false);
        }
      }

      async function commit(next) {
        if (disabled || !next) return;
        /* BUG FIX (issue 6, deeper cause): a second commit while one was in
         * flight was silently DROPPED (`if busyRef.current return`), so a fast
         * drag-then-release could leave the UI showing a level that was never
         * submitted. Instead we coalesce: remember the newest intent and run it
         * once the current request settles, so the last choice always wins. */
        pendingRef.current = next;
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
          while (pendingRef.current) {
            const want = pendingRef.current;
            pendingRef.current = null;
            const result = await select(want);
            if (result && !result.ok) throw new Error(result.error?.message || t('failed'));
            if (result === undefined) throw new Error(t('unavailable'));
          }
        } catch (cause) {
          pendingRef.current = null;
          if (mountedRef.current) setError(cause?.message || t('failed'));
        } finally {
          busyRef.current = false;
          if (mountedRef.current) {
            setBusy(false);
            setPreview(null);
            previewRef.current = null;
          }
        }
      }

      function chooseEffort(id) {
        if (!selection || disabled || !efforts.some(e => e.id === id)) return;
        showEffort(id);
        if (id !== savedEffort) void commit({ ...selection, reasoningEffort: id });
        else { previewRef.current = null; setPreview(null); }
      }

      function chooseModel(providerId, nextModel) {
        if (disabled || busyRef.current) return;
        const same = selection?.provider === providerId && selection?.model === nextModel.id;
        /* Middle level on switch (reference rule): floor(n/2). A model with no
         * declared levels gets a payload with NO `reasoningEffort` key at all —
         * absent means "no opinion", which is not the same as an explicit null. */
        const levels = sortEfforts(nextModel.reasoning?.efforts);
        const mid = levels.length ? levels[Math.floor(levels.length / 2)].id : undefined;
        const id = same ? savedEffort : mid;
        setPane('effort');
        setView(1);
        setSubProvider(null);
        setQuery('');
        timersRef.current.forEach(clearTimeout);
        setMessage(false);
        setPreview(null);
        previewRef.current = null;
        void commit({
          provider: providerId, model: nextModel.id,
          ...(id === undefined ? {} : { reasoningEffort: id })
        });
      }

      function close() {
        cancelDrag();
        setOpen(false);
        setQuery('');
        /* BUG FIX (issue 2): the pane must be reset on close. The popover's
         * height is driven by `--${P}-height`, which is 104px for the effort
         * pane but the (taller) list height for the model pane. Leaving
         * `pane === 'models'` meant reopening animated the height from the list
         * height back down to 104px — the visible "panel retracts from above"
         * flicker. Resetting here also matches the original app, which always
         * opens on the effort pane. The drill-down state resets with it. */
        setPane('effort');
        setView(1);
        setSubProvider(null);
        setHighlight(0);
        triggerRef.current?.focus({ preventScroll: true });
      }

      /* ---------- positioning + outside click + Escape ---------- */
      useLayoutEffect(() => {
        if (!open) return;
        let frame = 0;
        function outside(event) {
          if (!rootRef.current?.contains(event.target)) close();
        }
        function escape(event) {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          /* Escape backs out one layer at a time, matching the reference:
           * page 2 -> page 1 -> effort pane -> closed. */
          if (latest.current.pane === 'models') {
            if (latest.current.view === 2) { goBack(); }
            else { setPane('effort'); setQuery(''); }
          } else close();
        }
        function align() {
          const trigger = triggerRef.current?.getBoundingClientRect();
          const popup = popupRef.current;
          if (!trigger || !popup || !rootRef.current) return;
          const width = Math.min(272, window.innerWidth - 24);
          const left = Math.max(12, Math.min((trigger.left + trigger.right - width) / 2, window.innerWidth - width - 12));
          const bottom = Math.max(12, window.innerHeight - trigger.top + 8);
          rootRef.current.style.setProperty(`--${P}-left`, `${left}px`);
          rootRef.current.style.setProperty(`--${P}-bottom`, `${bottom}px`);
        }
        function resized() {
          cancelAnimationFrame(frame);
          const until = performance.now() + 500;
          const settle = () => { align(); if (performance.now() < until) frame = requestAnimationFrame(settle); };
          frame = requestAnimationFrame(settle);
        }
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape, true);
        window.addEventListener('resize', resized);
        document.addEventListener('scroll', align, true);
        align();
        return () => {
          document.removeEventListener('pointerdown', outside);
          document.removeEventListener('keydown', escape, true);
          window.removeEventListener('resize', resized);
          document.removeEventListener('scroll', align, true);
          cancelAnimationFrame(frame);
        };
      }, [open]);

      /* focus the search box when the model pane opens */
      useLayoutEffect(() => {
        if (open && pane === 'models' && searchRef.current) searchRef.current.focus({ preventScroll: true });
      }, [open, pane]);

      /* ---------- rail pointer math (shared by knob / fill / dots) ---------- */
      /* The knob centre travels over [15, width-15], so a pointer maps to a
       * 0..1 fraction over that same inset span. */
      function fractionAt(clientX) {
        const box = railRef.current?.getBoundingClientRect();
        if (!box || box.width <= 30) return 0;
        return Math.max(0, Math.min(1, (clientX - box.left - 15) / (box.width - 30)));
      }
      function nearestIndex(clientX) {
        if (efforts.length < 2) return 0;
        /* A missing/non-numeric coordinate can only mean "no pointer position";
         * resolving it to the CURRENT stop keeps every caller on the ladder. */
        if (!Number.isFinite(clientX)) return Math.max(0, index);
        return Math.round(fractionAt(clientX) * (efforts.length - 1));
      }
      /* Pixel position of the knob centre for a continuous fraction. */
      function knobX(frac) {
        const box = railRef.current?.getBoundingClientRect();
        if (!box) return 15;
        return 15 + frac * (box.width - 30);
      }
      /* Fill width in px: ends exactly at the knob centre. */
      function fillW(frac) {
        return knobX(frac);
      }

      /* During a drag the knob tracks the pointer continuously (no snapping);
       * the value snaps only on release. Both the knob and the fill derive from
       * ONE unitless variable, `--${P}-pos` (0..1), which is also what React
       * writes on every render.
       *
       * IMPORTANT (issue 3): `paintLive` writes a RAW fraction. If the release
       * lands on the same level that was already previewed, React BAILS OUT of
       * re-rendering (same state), so nothing rewrites the variable and the knob
       * would stay parked wherever the pointer stopped. `snapLive` therefore
       * always writes the snapped fraction back before we commit, so the knob
       * provably settles on a stop even when React has nothing new to render. */
      const liveRef = useRef(null);

      function paintLive(frac) {
        const rail = railRef.current;
        if (!rail) return;
        rail.style.setProperty(`--${P}-pos`, String(frac));
      }

      /** Fraction of a given stop index (the value the ladder snaps to). */
      function stopFraction(i) {
        return efforts.length > 1 ? i / (efforts.length - 1) : 0;
      }

      /** Force the knob onto a stop, bypassing React's bail-out. */
      function snapLive(i) {
        const rail = railRef.current;
        if (!rail) return;
        rail.style.setProperty(`--${P}-pos`, String(stopFraction(i)));
      }

      /* ONE place applies a pointer position to the rail. Called by the press
       * and by the document-level move listener below, so both routes produce
       * exactly the same value (continuous, no snapping while down). */
      function applyPointer(clientX) {
        const frac = fractionAt(clientX);
        liveRef.current = frac;
        paintLive(frac);
        const i = Math.round(frac * (efforts.length - 1));
        const id = efforts[i]?.id;
        if (id && id !== previewRef.current) showEffort(id);
      }

      function pointerDown(event) {
        /* Deliberately NOT gated on `busyRef`. An in-flight commit must never
         * make the rail ungrabbable — that was a large part of the "sometimes
         * I cannot grab it" symptom. Commits coalesce, so a drag started during
         * one simply supersedes it. Only a genuinely non-interactive rail
         * (disabled session / single level) refuses the gesture. */
        if (disabled || efforts.length < 2) return;
        /* Suppress the browser's own press-drag defaults (text selection, native
         * drag-and-drop). Those default actions are what fire `pointercancel`
         * and silently kill a drag mid-gesture — the "拖动中途变成无法选中" bug. */
        event.preventDefault();
        railRef.current?.focus({ preventScroll: true });
        /* Pointer capture is a convenience, NOT the mechanism: the gesture is
         * owned by the document listener below, so losing capture (or never
         * being granted it) can no longer strand a drag. */
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* non-fatal */ }
        dragRef.current = true;
        pointerRef.current = event.pointerId;
        setDragging(true);
        setHovered(-1);
        applyPointer(event.clientX);
      }

      /* Hover feedback only. The drag branch lives in the document listener, so
       * a moved pointer is applied exactly once per event. */
      function pointerMove(event) {
        if (dragRef.current) return;
        /* BUG FIX: this used to pass the EVENT OBJECT where a clientX was
         * expected, so the mapping was NaN and the "you are near this tick"
         * highlight never fired at all. Pass the coordinate. */
        const i = nearestIndex(event.clientX);
        const box = railRef.current?.getBoundingClientRect();
        if (!box) return;
        const tickX = box.left + 15 + i / Math.max(1, efforts.length - 1) * (box.width - 30);
        setHovered(Math.abs(event.clientX - tickX) < 10 && i !== index ? i : -1);
      }

      function finish(event) {
        if (!dragRef.current) return;
        dragRef.current = false;
        pointerRef.current = null;
        setDragging(false);
        liveRef.current = null;
        /* Issue 3: snap the knob onto the nearest stop. Writing the snapped
         * fraction here is what guarantees the knob SETTLES — relying on
         * React's next render is not enough, because releasing on the level
         * that was already previewed produces identical state and React bails
         * out without rewriting the variable. The CSS transition animates it.
         *
         * A pointerup WITHOUT coordinates (a synthesised release, a lost
         * capture, a programmatic settle) must resolve to the stop the knob is
         * already on. `nearestIndex(NaN)` would return NaN and `snapLive(NaN)`
         * would write `--${P}-pos: NaN`, which makes the knob's `left:calc(...)`
         * invalid and throws the knob across the track. */
        const known = event != null && Number.isFinite(event.clientX);
        const i = known ? nearestIndex(event.clientX) : index;
        snapLive(i);
        const target = efforts[i] ?? efforts[index];
        if (target) chooseEffort(target.id);
      }

      /* A cancelled drag rolls back to the last COMMITTED level (not a commit).
       * The knob must land on that stop too, for the same bail-out reason. */
      function cancelDrag() {
        if (!dragRef.current) return;
        dragRef.current = false;
        pointerRef.current = null;
        setDragging(false);
        liveRef.current = null;
        previewRef.current = null;
        setPreview(null);
        timersRef.current.forEach(clearTimeout);
        setMessage(false);
        snapLive(index);
      }

      function keyDown(event) {
        let next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next++;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next--;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = efforts.length - 1;
        else return;
        event.preventDefault();
        const i = Math.max(0, Math.min(efforts.length - 1, next));
        /* Keyboard moves already land on a stop, but snap explicitly so the
         * same bail-out cannot leave a stale position behind. */
        snapLive(i);
        const target = efforts[i];
        if (target) chooseEffort(target.id);
      }

      /* ---------- model pane: two-level drill-down ---------- */
      const modelCount = groups.reduce((n, g) => n + g.models.length, 0);

      /* The provider whose models page 2 is showing (null on page 1). */
      const activeProvider = subProvider === null
        ? null
        : groups.find(g => g.id === subProvider) ?? null;

      /* Page 2's rows, filtered by the query. Matching is the same
       * case-insensitive ordered-subsequence rule the shipped selector uses. */
      const providerModels = useMemo(() => {
        if (!activeProvider) return [];
        const q = query.trim().toLowerCase();
        if (!q) return activeProvider.models;
        return activeProvider.models.filter(m => {
          const name = (m.name || m.id).toLowerCase();
          if (name.includes(q)) return true;
          let i = 0;
          for (const ch of name) if (ch === q[i]) i++;
          return i === q.length;
        });
      }, [activeProvider, query]);

      /* Page 1 is a plain provider list; nothing to filter there. */
      const flatModels = useMemo(
        () => (activeProvider
          ? providerModels.map(m => ({ group: activeProvider, model: m }))
          : []),
        [activeProvider, providerModels]
      );

      function enterProvider(gid) {
        setSubProvider(gid);
        setQuery('');
        setHighlight(0);
        setView(2);
      }
      function goBack() {
        setView(1);
        setSubProvider(null);
        setQuery('');
        setHighlight(0);
      }

      useEffect(() => { setHighlight(0); }, [query, pane, view]);

      function modelKeyDown(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!flatModels.length) return;
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          setHighlight(prev => (prev + delta + flatModels.length) % flatModels.length);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const entry = flatModels[highlight];
          if (entry) chooseModel(entry.group.id, entry.model);
        } else if (event.key === 'Home') {
          event.preventDefault(); setHighlight(0);
        } else if (event.key === 'End') {
          event.preventDefault(); setHighlight(flatModels.length - 1);
        }
      }

      /* ---------- render ---------- */
      const currentLabel = efforts.length
        ? (effortLabel(efforts[index], t) || t('effort'))
        : '';
      const triggerLabel = effortLabel(efforts.find(e => e.id === savedEffort), t);
      const status = error || (state.status === 'error' ? t('failed') : '');

      /* Height is computed from the rows actually rendered, so the popover fits
       * its content and shrinks while searching. Constants mirror the CSS
       * (provider row 41, model row 39, list cap 252, page-2 head 36, search 40,
       * empty block 48) — the reference implementation learned the hard way that
       * a stale row height clips the last row with no way to scroll back. */
      const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;
      const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, SEC_H = 30, PAD = 20;
      const noticeRows = (state.failures?.length ?? 0);
      const noticeH = noticeRows > 0
        ? Math.min(noticeRows, 4) * 30 + (groups.length === 0 ? 8 : 4)
        : (groups.length === 0 ? EMPTY_H : 0);

      let menuHeight;
      if (view !== 2 || !activeProvider) {
        menuHeight = PAD + Math.max(44, SEC_H + groups.length * ROW_H + noticeH);
      } else {
        const n = providerModels.length;
        const listH = n === 0
          ? EMPTY_H + LIST_PAD_B
          : Math.min(n * MODEL_H + LIST_PAD_B, LIST_MAX_H);
        menuHeight = PAD + Math.max(44, HEAD_H + SEARCH_H + listH);
      }

      /* Issue 2: cap the requested height to the space actually available above
       * the trigger, so a long provider list scrolls INSIDE the panel instead of
       * overflowing the window. `--cmes-bottom` is the very variable the
       * positioning effect writes, so this tracks the real anchor. */
      const bottomVar = rootRef.current
        ? parseFloat(getComputedStyle(rootRef.current).getPropertyValue(`--${P}-bottom`)) || 40
        : 40;
      const roomAbove = typeof window === 'undefined'
        ? Infinity
        : Math.max(120, window.innerHeight - bottomVar - 24);
      const cappedHeight = Math.min(menuHeight, roomAbove);

      const classes = [
        `${P}-popover`,
        !open ? 'closed' : '',
        peak ? 'peak' : '',
        fast ? 'fast-mode' : '',
        message ? 'message' : ''
      ].filter(Boolean).join(' ');

      /* --- model pane: page 1 (providers) + page 2 (that provider's models) --- */
      const providerNodes = groups.map(g => {
        const isCurrent = selection?.provider === g.id;
        return h('button', {
          key: `p-${g.id}`,
          className: `${P}-row`,
          type: 'button',
          'aria-expanded': view === 2 && subProvider === g.id,
          onClick: () => enterProvider(g.id)
        },
          /* Issue 1: blue dot marks the provider that owns the current model.
           * It sits at the RIGHT end of the row (just before the chevron), so
           * it lands where the eye scans for row status. The provider's
           * currently selected model name used to sit there too; it is
           * deliberately gone (the second level already shows it), leaving
           * name + dot + chevron. */
          h('span', { className: `${P}-rowName` }, g.name),
          h('span', { className: `${P}-rowDot`, hidden: !isCurrent, 'aria-hidden': true }),
          icon('chevron', `${P}-rowChev`));
      });

      /* Failures are surfaced, not swallowed: after taking over the seat, the
       * shipped selector's per-provider failure list is ours to report too. */
      const noticeNodes = [];
      if (noticeRows > 0) {
        (state.failures || []).slice(0, 4).forEach((f, i) => {
          noticeNodes.push(h('div', {
            key: `f-${i}`, className: `${P}-failure`,
            title: f.message
          }, `${f.name} 加载失败：${f.message}`));
        });
      } else if (groups.length === 0) {
        noticeNodes.push(h('div', { key: 'empty', className: `${P}-empty` },
          state.status === 'loading' ? t('loading') : t('empty')));
      }

      const modelNodes = providerModels.map(m => {
        const entry = flatModels.findIndex(x => x.model.id === m.id);
        const selected = selection?.provider === activeProvider?.id && selection?.model === m.id;
        const levelCount = sortEfforts(m.reasoning?.efforts).length;
        return h('button', {
          key: `m-${m.id}`,
          className: `${P}-model${selected ? ' sel' : ''}${levelCount ? '' : ' na'}${entry === highlight ? ' hovered' : ''}`,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': selected,
          disabled: busy,
          title: levelCount ? `${levelCount} 档` : '该模型不支持推理等级',
          onMouseEnter: () => setHighlight(entry),
          onClick: () => chooseModel(activeProvider.id, m)
        },
          h('span', { className: `${P}-modelName` },
            /* the same label child slot, in its `option` placement, so a
             * decoration that exists in the shipped list also shows here
             * (catalog name is the fallback) */
            h('span', null,
              renderSlot
                ? renderSlot('conversation.input.model.label', {
                    provider: { id: activeProvider.id, name: activeProvider.name },
                    model: m, placement: 'option', selected
                  }, { fallback: m.name || m.id })
                : (m.name || m.id)),
            h('span', { className: `${P}-cnt` }, levelCount ? `${levelCount} 档` : '不支持')),
          icon('check', `${P}-ck`));
      });
      if (activeProvider && !modelNodes.length) {
        modelNodes.push(h('div', { key: 'empty', className: `${P}-empty` }, t('noMatch')));
      }

      const modelsView = h('div', {
        className: `${P}-pane ${P}-models${pane !== 'models' ? ' hidden' : ''}`,
        role: 'menu', 'aria-label': t('model'),
        inert: pane !== 'models' ? '' : undefined,
        onKeyDown: modelKeyDown
      },
        h('div', {
          className: `${P}-viewport${view === 2 ? ' view2' : ''}`,
          'aria-hidden': false
        },
          /* page 1 — providers (own scroller so a long list is reachable) */
          h('div', { className: `${P}-page slot1` },
            h('div', { className: `${P}-sec` }, t('model')),
            h('div', { className: `${P}-rows` }, ...providerNodes, ...noticeNodes)),

          /* page 2 — models of the chosen provider */
          h('div', {
            className: `${P}-page slot2`,
            inert: view !== 2 ? '' : undefined
          },
            h('div', { className: `${P}-head` },
              h('button', {
                type: 'button', className: `${P}-back`,
                'aria-label': t('back'), title: t('back'),
                onClick: goBack
              }, icon('chevron', `${P}-iconSmall`)),
              h('span', { className: `${P}-title` },
                activeProvider ? activeProvider.name : '')),
            h('label', { className: `${P}-search` },
              icon('search', `${P}-iconSmall`),
              h('input', {
                ref: searchRef, type: 'text', value: query,
                placeholder: t('search'), 'aria-label': t('search'),
                spellCheck: false,
                onChange: e => setQuery(e.target.value)
              })),
            h('div', { className: `${P}-list` }, ...modelNodes))));

      /* --- effort pane --- */
      const effortView = h('div', {
        className: `${P}-pane ${P}-main${pane !== 'effort' ? ' hidden' : ''}`,
        inert: pane !== 'effort' ? '' : undefined
      },
        h('button', {
          className: `${P}-tool ${P}-fast${fast ? ' active' : ''}`,
          ref: fastBtnRef,
          'aria-label': t('fast'), 'aria-pressed': fast,
          'aria-describedby': 'cmes-fast-tip',
          /* The tooltip CANNOT be a child of this button: the popover's
           * backdrop-filter would make itself the containing block for a fixed
           * descendant and clip it away. It is rendered at the root (see the
           * return value) and revealed through `tipOn`. */
          onPointerEnter: () => setTipOn(true),
          onPointerLeave: () => setTipOn(false),
          onFocus: () => setTipOn(true),
          onBlur: () => setTipOn(false),
          onClick: () => setFast(v => !v)
        },
          h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true, style: { width: 15, height: 17, fill: fast ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: fast ? 0.7 : 1.5, strokeLinejoin: 'round' } },
            h('path', { d: ICON.bolt }))),

        h('button', {
          className: `${P}-modelLink`, onClick: () => setPane('models'),
          'aria-label': t('model'), title: modelName
        },
          h('span', { className: `${P}-heading` }, currentLabel || t('choose'), icon('chevron', `${P}-iconSmall`)),
          h('span', { className: `${P}-modelName` }, modelName)),

        h('div', { className: `${P}-warning` }, h('span', null, t('warning'))),

        h('button', {
          className: `${P}-tool ${P}-reset`,
          disabled: busy || !model?.reasoning,
          'aria-label': t('reset'), title: t('reset'),
          onClick: () => { setFast(false); chooseEffort(model?.reasoning?.defaultEffort); }
        }, icon('reset')),

        efforts.length
          ? h('div', {
              className: `${P}-rail${dragging ? ' dragging' : ''}`,
              ref: railRef,
              /* Per-level colouring (issue 3): the fill, the un-filled track
               * tint, the heading ink and the dots all derive from the CURRENT
               * level, so every stop reads as its own colour instead of only
               * Ultra being special. */
              style: {
                [`--${P}-fill`]: fillFor(displayed, dark),
                [`--${P}-track`]: trackFor(fillFor(displayed, dark), dark),
                [`--${P}-ink`]: inkFor(displayed, dark),
                [`--${P}-dot`]: 'var(--dsw-alias-label-caption,#b6b6b8)',
                /* the bloom's motes are the CURRENT level's colour lifted
                 * toward white — for Ultra that lands on the measured
                 * #ceb0fa-ish violet without a second hard-coded table */
                [`--${P}-mote`]: mixHex(fillFor(displayed, dark), '#ffffff', dark ? 0.30 : 0.42),
                /* one unitless fraction drives both knob and fill */
                [`--${P}-pos`]: fraction
              },
              role: 'slider', tabIndex: 0,
              'aria-label': t('effort'),
              'aria-valuemin': 0, 'aria-valuemax': efforts.length - 1,
              'aria-valuenow': index, 'aria-valuetext': currentLabel,
              'aria-disabled': busy || disabled,
              onPointerDown: pointerDown, onPointerMove: pointerMove,
              onPointerUp: finish, onPointerCancel: cancelDrag,
              onLostPointerCapture: () => { /* capture loss is not a cancel */ },
              onPointerLeave: () => setHovered(-1),
              onKeyDown: keyDown
            },
              h('div', { className: `${P}-fill` }),
              ...efforts.map((effort, i) => h('i', {
                key: effort.id,
                className: `${P}-dot${i <= index ? ' passed' : ''}${hovered === i ? ' hovered' : ''}`,
                style: { [`--${P}-tick`]: efforts.length > 1 ? i / (efforts.length - 1) : 0 }
              })),
              h('div', { className: `${P}-sparks` },
                ...sparkles.map(s => h('i', {
                  key: s.key, className: `${P}-sp`,
                  style: { top: s.top, [`--b`]: s.b, [`--dur`]: s.dur, [`--delay`]: s.delay }
                }))),
              /* the arrival bloom: keyed on the arrival counter, so mounting a
               * new key restarts every mote's animation from 0% */
              bloom
                ? h('div', {
                    key: `bloom-${bloom}`, className: `${P}-bloom`, 'aria-hidden': true
                  },
                    h('i', { className: `${P}-halo` }),
                    ...bloomMotes.map(m => h('i', {
                      key: m.key, className: `${P}-bp`,
                      style: {
                        [`--x0`]: m.x0, [`--y0`]: m.y0,
                        [`--x1`]: m.x1, [`--y1`]: m.y1,
                        [`--sz`]: m.sz, [`--bmax`]: m.bmax,
                        [`--bd`]: m.bd, [`--bdel`]: m.bdel
                      }
                    })))
                : null,
              h('div', { className: `${P}-knob` }))
          : h('div', { className: `${P}-noeffort` }, t('unsupported')));

      return h('div', { className: `${P}-root`, ref: rootRef },
        h('style', null, CSS),

        h('button', {
          className: `${P}-trigger${isPeakId(savedEffort) ? ' peak' : ''}${fast ? ' fast' : ''}`,
          ref: triggerRef, disabled,
          'aria-label': `${modelName} ${triggerLabel}`.trim(),
          'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-busy': busy,
          /* the collapsed seat also shows the level colour (issue 3) */
          style: { [`--${P}-ink`]: inkFor(savedEffort, dark) },
          onClick: () => {
            if (open) close();
            else { setPane(model ? 'effort' : 'models'); setOpen(true); load(); }
          }
        },
          fast ? h('svg', { className: `${P}-bolt`, viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: ICON.bolt })) : null,
          h('span', { className: `${P}-compact` }, icon('model')),
          h('span', { className: `${P}-caption` },
            /* DSH 0.2.1-rc.2 gives the seat a child slot,
             * `conversation.input.model.label`, for inline label decoration
             * (the shipped 1017 badge registers into it). Shadowing the parent
             * seat without declaring that child would make the extension's
             * `slots.inject` wait forever and the badge would silently vanish,
             * so we declare it in the registration and render it here, with the
             * catalog name as the fallback. `renderSlot` only exists when the
             * entry declares children, so 0.2.0 hosts keep the plain name. */
            model && renderSlot
              ? renderSlot('conversation.input.model.label', {
                  provider: { id: group?.id, name: group?.name },
                  model, placement: 'trigger', selected: true
                }, { fallback: modelName })
              : modelName,
            triggerLabel ? h('span', { className: `${P}-triggerEffort` }, ` ${triggerLabel}`) : null),
          icon('down', `${P}-chev`)),

        h('section', {
          className: classes, ref: popupRef, role: 'dialog',
          'aria-label': pane === 'models' ? t('model') : t('effort'),
          'aria-hidden': !open, inert: !open ? '' : undefined,
          style: {
            [`--${P}-height`]: `${pane === 'models' ? cappedHeight : 104}px`,
            /* the heading ink is stamped here so the effort pane's title picks
             * up the current level's colour */
            [`--${P}-ink`]: inkFor(displayed, dark)
          }
        },
          modelsView,
          effortView,
          busy ? h('div', { className: `${P}-sr`, role: 'status' }, t('busy')) : null,
          status ? h('div', { className: `${P}-status`, role: 'alert', style: { position: 'absolute', left: 12, right: 12, bottom: 6, color: 'var(--dsw-alias-state-error-primary)' } },
            h('span', null, status)) : null),

        /* THE FAST TOOLTIP — a sibling of the popover, NOT a descendant of it.
         * The popover's backdrop-filter makes it the containing block for fixed
         * descendants and its `overflow:hidden` then clips them, which is why
         * hovering used to reveal nothing at all. `.cmes-root` has no
         * transform/filter, so `position:fixed` here is viewport-relative and
         * nothing clips it. It is portalled no further than this wrapper, which
         * keeps it inside the plugin's own tree (no react-dom dependency). */
        h('span', {
          role: 'tooltip', id: 'cmes-fast-tip',
          className: `${P}-tip${tipShown ? ' show' : ''}`,
          ref: tipRef, 'aria-hidden': tipShown ? undefined : 'true'
        },
          h('span', { className: `${P}-tipTitle` }, t('fast')),
          h('span', null, t('usage')),
          /* the reference card is two lines; the honesty note stays discoverable
           * by assistive tech rather than being deleted outright */
          h('span', { className: `${P}-sr` }, t('visual'))));
    }

    /* ================================================================== *
     * Plugin
     * ================================================================== */
    return {
      inject: ['slots', 'modelDirectories', 'sessions', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }));
        ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
          name: 'conversation.input.model',
          locale: NS,
          /* DSH 0.2.1-rc.2: a seat entry also DECLARES its child slots, and the
           * child exists only while the declaring entry is mounted. The shipped
           * selector declares `conversation.input.model.label` here so plugins
           * can decorate the model name; other shipped packages (the 1017 badge)
           * register into it, and `slots.inject` parks a contributor until the
           * slot is declared at all. Shadowing the parent seat and NOT declaring
           * the child therefore drops those contributions silently, so we
           * declare the same child with the same shape. Declaring it also makes
           * the renderer hand this component a `renderSlot` binding (see the
           * trigger), which is what keeps the decoration visible. */
          children: {
            'conversation.input.model.label': {
              kind: 'single', scope: 'session', inline: true
            }
          },
          /* `conversation.input.model` is a `kind: 'single'` slot that the shipped
           * `@deepseek-ai/dsh-client-ui-model-selection` ModelSelect already
           * occupies at priority 0. A `single` slot permits only ONE entry per
           * priority and `register()` throws otherwise, so registering at 0
           * would fail the whole plugin load. Shadowing is by design here: the
           * projection keeps the lowest-priority entry of the cell, so -1 wins
           * the seat and the shipped selector stays on the ledger untouched —
           * uninstalling this plugin restores it with no residue. (0.2.1 also
           * re-ranks dynamically loaded packages onto its own shadowing ladder,
           * so an explicit -1 stays the right static-profile value without ever
           * colliding with an auto-assigned rank.) */
          priority: -1,
          inject(sessionId) {
            const directory = ctx.modelDirectories.directoryFor(sessionId);
            const available = ctx.sessions.subagentAddress(sessionId) === undefined;
            return {
              available,
              /* the seat is session-scoped, so the Fast preference has to be
               * keyed by this id to survive a conversation switch */
              sessionId,
              directory: directory.store,
              load: () => { if (available) directory.load().catch(() => {}); },
              select: sel => (available ? directory.select(sel) : Promise.resolve(undefined))
            };
          }
        }, Selector));
      }
    };
  }
});
