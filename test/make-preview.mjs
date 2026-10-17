/**
 * Build a browser preview of the plugin's real CSS + real markup logic.
 *
 * The plugin's `CSS` template and class names are extracted verbatim from
 * client.js (single source of truth), so what you see here is what the plugin
 * ships. Only the React runtime is replaced by a tiny local renderer.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const src = readFileSync(join(ROOT, 'client.js'), 'utf8');

// ---- extract the CSS template literal verbatim ----
const cssStart = src.indexOf('const CSS = `');
const cssEnd = src.indexOf('`;', cssStart);
if (cssStart === -1 || cssEnd === -1) throw new Error('CSS block not found');
let css = src.slice(cssStart + 'const CSS = `'.length, cssEnd);

// ---- extract the sparkle builder (to prove determinism) ----
const sparkFn = src.match(/const PHI = [\s\S]*?\n    }\n/);
if (!sparkFn) throw new Error('sparkle builder not found');

// Resolve the `${P}` template placeholders exactly as the plugin does.
const P = 'cmes';
css = css.replaceAll('${P}', P);

// The plugin styles live under `.cmes-root`, but for the preview we hoist the
// popover to top-left and neutralise the fixed positioning.
const HARNESS = `
/* preview-only scaffolding */
body{margin:0;padding:24px;background:#f8f8f8;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.stage{display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap}
.col{display:flex;flex-direction:column;gap:14px}
.label{font-size:11px;font-weight:600;color:#707073;letter-spacing:.06em;text-transform:uppercase}
/* the plugin's own root wrapper, exactly as client.js renders it */
.${P}-root{display:block}
.host{position:relative;width:272px;height:104px}
.host .${P}-popover{position:absolute !important;bottom:auto !important;left:0 !important;top:0 !important}
/* inside a list host the popover stays IN FLOW, so the host grows to its
   inline height instead of collapsing to 0 and stacking the panes */
.hostList{width:272px}
.hostList .${P}-popover{position:static !important;bottom:auto !important;left:auto !important;top:auto !important}
.wrap{position:relative;display:inline-block}
`;

// ---- markup: mirror the component's output for each state ----
function svg(d, size) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${size};height:${size};flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="${d}"/></svg>`;
}
const I = {
  chevron: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6', check: 'm20 6-11 11-5-5',
  back: 'm15 18-6-6 6-6', reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
  close: 'M6 6l12 12M18 6L6 18', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  bolt: 'M14.4 2Q16 .2 15.8 2.5L15.1 8.5H20.5Q22 8.5 21 9.8L10.7 21.7Q9 23.4 9.2 21.2L10 14.2H4.2Q2.6 14.2 3.6 12.9L14.4 2Z'
};

function sparkles(count = 22) {
  const PHI = 0.6180339887498949;
  const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let out = '';
  for (let i = 0; i < count; i++) {
    const b = (0.5 + 0.5 * hash01(i * 7 + 3)).toFixed(2);
    const top = (8 + 84 * hash01(i * 13 + 5)).toFixed(1);
    const dur = (1.6 + 2.4 * hash01(i * 3 + 11)).toFixed(2);
    const delay = (-(i * PHI % 1) * 4).toFixed(2);
    out += `<i class="${P}-sp" style="top:${top}%;--b:${b};--dur:${dur}s;--delay:${delay}s"></i>`;
  }
  return out;
}

const EFFORTS = [
  { id: 'off', label: '关闭' },
  { id: 'minimal', label: '极低' },
  { id: 'low', label: '轻度' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '极高' },
  { id: 'max', label: 'Ultra' }
];

/* Mirror the palettes in client.js so the preview shows the real colours. */
const FILL = {
  off: '#8a8a8f', minimal: '#4a8ef8', low: '#3a83f7', medium: '#4a72f2',
  high: '#5f5ce8', xhigh: '#7b48e8', max: '#914ef6'
};
const INK = {
  off: '#707073', minimal: '#2b62bd', low: '#2f6fd0', medium: '#3a55b8',
  high: '#4a3fc0', xhigh: '#6a35c8', max: '#8b46ee'
};
/* Dark tables — kept in step with EFFORT_FILL_DARK / EFFORT_INK_DARK. */
const FILL_DARK = {
  off: '#737378', minimal: '#3684ff', low: '#448dff', medium: '#6e90ff',
  high: '#928fff', xhigh: '#b18dff', max: '#bd91ff'
};
const INK_DARK = {
  off: '#a9a9ae', minimal: '#73a9ff', low: '#76aafe', medium: '#8ba7ff',
  high: '#a4a2ff', xhigh: '#bc9cff', max: '#c39bff'
};
const RAIL_BASE = { light: '#e8e7e8', dark: '#232324' };
/* Chrome colours the CSS resolves per theme; the preview pins them explicitly
 * because it renders both themes side by side instead of one live body. */
const CHROME = {
  light: { card: '#ffffff', label: '#0f1115', accent: '#3988f6' },
  dark: {
    card: '#2a2b2e', label: '#f9fafb', accent: '#7aaaff', knob: '#f9fafb',
    dotPassed: '#f9fafb', accentPeak: '#c39bff'
  }
};
function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function effortPane(index, opts = {}) {
  const theme = opts.theme || 'light';
  const fill = theme === 'dark' ? FILL_DARK : FILL;
  const ink = theme === 'dark' ? INK_DARK : INK;
  const chrome = CHROME[theme];
  const e = EFFORTS[index];
  const peak = e.id === 'max';
  const pos = index / (EFFORTS.length - 1);
  const message = !!opts.message;
  const dots = EFFORTS.map((_, i) =>
    `<i class="${P}-dot${i <= index ? ' passed' : ''}" style="--${P}-tick:${i / (EFFORTS.length - 1)}"></i>`).join('');
  const title = peak ? '' : `<span class="${P}-heading">${e.label}${svg(I.chevron, '10px')}</span>`;
  const railStyle = [
    `--${P}-fill:${fill[e.id]}`,
    `--${P}-track:${mixHex(RAIL_BASE[theme], fill[e.id], 0.22)}`,
    `--${P}-dot:var(--dsw-alias-label-caption,#b6b6b8)`,
    `--${P}-pos:${pos}`
  ].join(';');
  return `
  <div class="${P}-root" data-theme="${theme}">
  <div class="${P}-popover${peak ? ' peak' : ''}${message ? ' message' : ''}" style="--${P}-ink:${ink[e.id]}">
    <div class="${P}-pane ${P}-main">
      <button class="${P}-tool ${P}-fast${opts.fast ? ' active' : ''}">${svg(I.bolt, '15px')}
        <span class="${P}-tip"><span class="${P}-tipTitle">1.5 倍速</span><span>用量更多</span><span>(仅视觉效果)</span></span>
      </button>
      <button class="${P}-modelLink">
        ${title}
        <span class="${P}-modelName">${modelName(opts)}</span>
      </button>
      <div class="${P}-warning"><span>更快消耗使用额度</span></div>
      <button class="${P}-tool ${P}-reset">${svg(I.reset, '16px')}</button>
      <div class="${P}-rail" style="${railStyle}">
        <div class="${P}-fill"></div>
        ${dots}
        <div class="${P}-sparks">${sparkles()}</div>
        <div class="${P}-knob"></div>
      </div>
    </div>
  </div></div>`;
}
function modelName(opts) { return opts.model || '6 Astra'; }

/* Provider list mirrors the reported screenshot: five providers, with the
   current model living in the LAST one — which is exactly the row that used to
   be clipped with no way to scroll to it (issue 2). */
const MODELS = [
  { group: 'xiaomi', items: [['MiMo-V2.6-Flash', false]] },
  { group: 'DeepSeek', items: [['DeepSeek-V4-Pro', false]] },
  { group: 'DeepSeek Account', items: [['DeepSeek-V4-Flash', false]] },
  { group: 'WorkBuddy', items: [['WorkBuddy-Coder', false]] },
  { group: 'Trae', items: [['6 Astra', true], ['5.5', false], ['6.1 Sol', false], ['5.6 Terra', false], ['5.6 Sol', false]] }
];

/* Two-level drill-down preview: `view` is 1 (providers) or 2 (one provider's
   models). Mirrors the component's structure and height math. */
const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;
const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, SEC_H = 30, PAD = 20;

function providerNameOf(g) { return g.group; }

function modelsPane(query = '', view = 1, subProvider = null) {
  const q = query.trim().toLowerCase();
  const active = MODELS.find(g => g.group === subProvider) || null;

  let rows = [];
  if (active) {
    rows = active.items.filter(([name]) => {
      const n = name.toLowerCase();
      if (n.includes(q)) return true;
      let i = 0; for (const ch of n) if (ch === q[i]) i++;
      return i === q.length;
    });
  }

  const height = (view !== 2 || !active)
    ? PAD + Math.max(44, SEC_H + MODELS.length * ROW_H)
    : PAD + Math.max(44, HEAD_H + SEARCH_H
        + (rows.length === 0 ? EMPTY_H + LIST_PAD_B
           : Math.min(rows.length * MODEL_H + LIST_PAD_B, LIST_MAX_H)));

  const selectedGroup = MODELS.find(g => g.items.some(([, sel]) => sel)).group;

  const providerNodes = MODELS.map(g => {
    const isCur = g.group === selectedGroup;
    return `<button class="${P}-row" type="button" aria-expanded="${view === 2 && subProvider === g.group}">
      <span class="${P}-rowName">${providerNameOf(g)}</span>
      <span class="${P}-rowDot"${isCur ? '' : ' hidden'} aria-hidden="true"></span>
      ${svg(I.chevron, '11px').replace('style="', `class="${P}-rowChev" style="`)}
    </button>`;
  }).join('');

  const modelNodes = rows.map(([name, sel]) => `
    <button class="${P}-model${sel ? ' sel' : ''}" type="button" role="menuitemradio" aria-checked="${sel}">
      <span class="${P}-modelName"><span>${name}</span><span class="${P}-cnt">4 档</span></span>
      ${svg(I.check, '15px').replace('style="', `class="${P}-ck" style="`)}
    </button>`).join('') || `<div class="${P}-empty">没有匹配的模型</div>`;

  return `
  <div class="${P}-root">
  <div class="${P}-popover" style="--${P}-height:${height}px">
    <div class="${P}-pane ${P}-models">
      <div class="${P}-viewport${view === 2 ? ' view2' : ''}">
        <div class="${P}-page slot1">
          <div class="${P}-sec">切换模型</div>
          <div class="${P}-rows">${providerNodes}</div>
        </div>
        <div class="${P}-page slot2">
          <div class="${P}-head">
            <button class="${P}-back" type="button" aria-label="返回">
              ${svg(I.back, '12px')}
            </button>
            <span class="${P}-title">${active ? active.group : ''}</span>
          </div>
          <label class="${P}-search">
            ${svg(I.search, '13px')}
            <input type="text" value="${query}" placeholder="搜索模型…">
          </label>
          <div class="${P}-list">${modelNodes}</div>
        </div>
      </div>
    </div>
  </div></div>`;
}

function trigger(effortIdx, theme = 'light') {
  const e = EFFORTS[effortIdx];
  const ink = theme === 'dark' ? INK_DARK[e.id] : INK[e.id];
  return `
  <div class="${P}-root" style="display:inline-flex" data-theme="${theme}">
  <button class="${P}-trigger${e.id === 'max' ? ' peak' : ''}" style="--${P}-ink:${ink}">
    <span class="${P}-caption">6 Astra <span class="${P}-triggerEffort">${e.label}</span></span>
    ${svg(I.down, '12px').replace('style="', `class="${P}-chev" style="`)}
  </button></div>`;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>Plugin preview — Codex model & effort selector</title>
<style>${css}${HARNESS}
/* preview-only: emulate both shipped themes side by side. In the real client
   DSH toggles data-ds-dark-theme on <body> and the tokens flip on their own. */
[data-theme="light"]{
  --dsw-alias-bg-layer-2:#ffffff;--dsw-alias-label-primary:#0f1115;
  --dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#81858c;
  --dsw-alias-label-caption:#adb2b8;--dsw-alias-border-l1:rgba(0,0,0,.07);
  --dsw-alias-interactive-bg-hover:#2631480f;--dsw-specific-menu:#f8f9fa94;
  --dsw-elevation-panel:0 0 0 .5px rgba(0,0,0,.07),0 3px 8px 0 #00000008,0 0 16px 0 #00000005;
  --dsw-menu-backdrop-filter:none;
}
[data-theme="dark"]{
  --dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-label-primary:#f9fafb;
  --dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;
  --dsw-alias-label-caption:#81858c;--dsw-alias-border-l1:#ffffff0f;
  --dsw-alias-interactive-bg-hover:#ffffff14;--dsw-specific-menu:#43454a73;
  --dsw-elevation-panel:0 0 0 .5px #ffffff0f,0 3px 8px 0 #00000014,0 0 16px 0 #0000000a;
  --dsw-menu-backdrop-filter:none;
  color-scheme:dark;
}
.stageDark{background:#151517;border-radius:12px;padding:16px;margin:-8px}
.stageDark .label{color:#8a8f98}
.stageDark .host,.stageDark .hostList,.stageDark .wrap{--dsw-alias-bg-layer-2:#2c2c2e}
/* every dark stage gets the shipped dark chrome on its own subtree */
[data-theme="dark"]{
  --cmes-knob:${CHROME.dark.knob};
  --cmes-dotPassed:${CHROME.dark.dotPassed};
  --cmes-accent:${CHROME.dark.accent};
  --cmes-accentPeak:${CHROME.dark.accentPeak};
  --cmes-accentHalo:rgba(122,170,255,.20);
  --cmes-warnHi:#c39bff;--cmes-warnLo:#f3e6ff;
  --cmes-peakGradient:linear-gradient(90deg,#3e89ff 0%,#438bff 10%,#518dff 20%,#668bff 30%,#7c8aff 40%,#9386ff 50%,#a084ff 55%,#a785ff 60%,#b085ff 65%,#b087ff 70%,#af8bff 75%,#ae8fff 80%,#ae91ff 85%,#af95ff 93%,#b296fe 100%);
  --dsw-elevation-stroke-color:rgba(176,133,255,.45);
}
</style>
</head><body>
<h1 style="font-size:15px;margin:0 0 4px">插件实渲染预览（client.js 的真实 CSS + 真实结构）</h1>
<p style="font-size:12px;color:#707073;margin:0 0 22px;line-height:1.7;max-width:860px">
  CSS 与类名直接取自 <code>client.js</code> 的 <code>CSS</code> 模板，未做任何改写。此页只替换 React 运行时。<br>
  ① 每档一色（填充 / 轨道 / 标题同步）&nbsp; ② 模型面板两级下钻&nbsp; ③ <b>深色模式</b>：右列是深色主题下的同一组件——填充、轨道、标题 ink、旋钮与 Ultra 渐变全部换成按官方深色表面解出的色板
</p>

<div class="stage">
  <div class="col">
    <div class="label">浅色 · Effort pane · 全部 7 档（每档一色）</div>
    ${EFFORTS.map((_, i) => `<div class="host">${effortPane(i, { theme: 'light' })}</div>`).join('')}
    <div class="label">浅色 · Ultra 进入瞬间（警示态）</div>
    <div class="host">${effortPane(6, { theme: 'light', message: true })}</div>
  </div>
  <div class="col stageDark">
    <div class="label">深色 · Effort pane · 全部 7 档（每档一色）</div>
    ${EFFORTS.map((_, i) => `<div class="host">${effortPane(i, { theme: 'dark' })}</div>`).join('')}
    <div class="label">深色 · Ultra 进入瞬间（警示态）</div>
    <div class="host">${effortPane(6, { theme: 'dark', message: true })}</div>
  </div>
  <div class="col">
    <div class="label">第一级 · 5 个 provider（蓝点标在行右侧标出当前模型所在组）</div>
    <div class="hostList">${modelsPane('', 1, null)}</div>
    <div class="label">第一级 · 窗口变矮时高度被截，列表内部可滚动（issue 2）</div>
    <div class="hostList" style="height:150px;overflow:hidden">
      ${modelsPane('', 1, null).replace(`--${P}-height:${PAD + Math.max(44, SEC_H + MODELS.length * ROW_H)}px`,
        `--${P}-height:150px`)}
    </div>
    <div class="label">第二级 · 该 provider 的模型 + 搜索</div>
    <div class="hostList">${modelsPane('', 2, 'Trae')}</div>
    <div class="label">第二级 · 搜索 "5"</div>
    <div class="hostList">${modelsPane('5', 2, 'Trae')}</div>
    <div class="label">第二级 · 无匹配</div>
    <div class="hostList">${modelsPane('zzz', 2, 'Trae')}</div>
    <div class="label">Trigger（收起态，同样带档位色）</div>
    <div class="wrap">${trigger(2)}${trigger(4)}${trigger(6)}</div>
    <div class="label">Trigger · 深色（收起态）</div>
    <div class="wrap stageDark" style="padding:12px">${trigger(2, 'dark')}${trigger(4, 'dark')}${trigger(6, 'dark')}</div>
  </div>
</div>
</body></html>`;

writeFileSync(join(HERE, 'preview.html'), html, 'utf8');
console.log('wrote preview.html', html.length, 'bytes');
console.log('css bytes:', css.length);
