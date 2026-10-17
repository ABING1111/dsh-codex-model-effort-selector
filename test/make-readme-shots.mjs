/**
 * Generate the README's images from the plugin's REAL CSS.
 *
 * The `CSS` template and every class name are extracted verbatim from
 * `client.js` — the single source of truth — so these are not hand-drawn
 * mockups: they are the shipped stylesheet rendered by a headless browser.
 * Only the React runtime is replaced by static markup.
 *
 * Usage:  node test/make-readme-shots.mjs
 * Output: docs/images/*.html + docs/images/*.png
 *
 * PNGs are produced with headless Edge/Chrome; if no browser is found the HTML
 * files are still written so the shots can be taken manually.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs', 'images');
mkdirSync(OUT, { recursive: true });

const src = readFileSync(join(ROOT, 'client.js'), 'utf8');

/* ---- extract the CSS template literal verbatim ---- */
const cssStart = src.indexOf('const CSS = `');
const cssEnd = src.indexOf('`;', cssStart);
if (cssStart === -1 || cssEnd === -1) throw new Error('CSS block not found');
const P = 'cmes';
let css = src.slice(cssStart + 'const CSS = `'.length, cssEnd).replaceAll('${P}', P);

/* ---- mirror the plugin's own constants (asserted equal, not copy-pasted) ---- */
const pick = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n    \\};`));
  if (!m) throw new Error(`${name} not found in client.js`);
  const out = {};
  /* several keys share a line, so this must be a GLOBAL scan */
  for (const kv of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[kv[1]] = kv[2];
  if (!Object.keys(out).length) throw new Error(`${name} parsed to nothing`);
  return out;
};
const FILL = pick('EFFORT_FILL');
const INK = pick('EFFORT_INK');
if (!FILL.max || FILL.max !== '#914ef6') throw new Error('palette drifted from client.js');

const EFFORTS = [
  { id: 'off', label: '关闭' },
  { id: 'minimal', label: '极低' },
  { id: 'low', label: '轻度' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '极高' },
  { id: 'max', label: 'Ultra' }
];
const idxOf = (id) => EFFORTS.findIndex((e) => e.id === id);

/* ---- the plugin's icons, copied verbatim from client.js ---- */
const ICON = (() => {
  const m = src.match(/const ICON = \{([\s\S]*?)\n    \};/);
  if (!m) throw new Error('ICON table not found');
  const out = {};
  for (const kv of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[kv[1]] = kv[2];
  return out;
})();

function svg(d, size, extra = '') {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${size};height:${size};flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"${extra}><path d="${d}"/></svg>`;
}

/* The bolt icon is the one glyph whose rendering changes with state: the
   component swaps `fill:none` + a 1.7 stroke for a SOLID bolt with a 0.7
   stroke when Fast is on. Mirrored here so the shots show the real thing. */
function boltSvg(fast) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:15px;height:17px;flex:none;fill:${fast ? 'currentColor' : 'none'};stroke:currentColor;stroke-width:${fast ? '0.7' : '1.5'};stroke-linejoin:round"><path d="${ICON.bolt}"/></svg>`;
}

/* deterministic sparkles — same golden-ratio + hash scheme as client.js */
function sparkles(count = 22) {
  const PHI = 0.6180339887498949;
  const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
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

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ---------- markup builders (mirror the component's output) ---------- */
function effortPane(id, opts = {}) {
  const e = EFFORTS[idxOf(id)];
  const peak = id === 'max';
  const pos = idxOf(id) / (EFFORTS.length - 1);
  const dots = EFFORTS.map((_, i) =>
    `<i class="${P}-dot${i <= idxOf(id) ? ' passed' : ''}" style="--${P}-tick:${i / (EFFORTS.length - 1)}"></i>`).join('');
  const title = `<span class="${P}-heading">${e.label}${svg(ICON.chevron, '10px')}</span>`;
  const railStyle = [
    `--${P}-fill:${FILL[id]}`,
    `--${P}-track:${mixHex('#e8e7e8', FILL[id], 0.22)}`,
    `--${P}-dot:var(--dsw-alias-label-caption,#b6b6b8)`,
    `--${P}-pos:${pos}`
  ].join(';');
  return `
  <div class="${P}-root">
  <div class="${P}-popover${peak ? ' peak' : ''}${opts.message ? ' message' : ''}${opts.fast ? ' fast-mode' : ''}" style="--${P}-ink:${INK[id]}">
    <div class="${P}-pane ${P}-main">
      <button class="${P}-tool ${P}-fast${opts.fast ? ' active' : ''}">${boltSvg(!!opts.fast)}
        <span class="${P}-tip"><span class="${P}-tipTitle">1.5 倍速</span><span>用量更多</span><span>(仅视觉效果)</span></span>
      </button>
      <button class="${P}-modelLink">
        ${title}
        <span class="${P}-modelName">${opts.model || '6 Astra'}</span>
      </button>
      <div class="${P}-warning"><span>更快消耗使用额度</span></div>
      <button class="${P}-tool ${P}-reset">${svg(ICON.reset, '16px')}</button>
      <div class="${P}-rail" style="${railStyle}">
        <div class="${P}-fill"></div>
        ${dots}
        <div class="${P}-sparks">${sparkles()}</div>
        <div class="${P}-knob"></div>
      </div>
    </div>
  </div></div>`;
}

const MODELS = [
  { group: 'xiaomi', items: [['MiMo-V2.6-Flash', false, 3]] },
  { group: 'DeepSeek', items: [['DeepSeek-V4-Pro', false, 4]] },
  { group: 'DeepSeek Account', items: [['DeepSeek-V4-Flash', false, 4]] },
  { group: 'WorkBuddy', items: [['WorkBuddy-Coder', false, 0]] },
  { group: 'Trae', items: [['6 Astra', true, 4], ['5.5', false, 4], ['6.1 Sol', false, 4], ['5.6 Terra', false, 4], ['5.6 Sol', false, 4]] }
];
const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;
const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, SEC_H = 30, PAD = 20;
const CUR = 'Trae';

function modelsPane({ query = '', view = 1, sub = null, height = null } = {}) {
  const q = query.trim().toLowerCase();
  const active = MODELS.find((g) => g.group === sub) || null;
  let rows = [];
  if (active) {
    rows = active.items.filter(([name]) => {
      const n = name.toLowerCase();
      if (n.includes(q)) return true;
      let i = 0; for (const ch of n) if (ch === q[i]) i++;
      return i === q.length;
    });
  }
  const h = height ?? ((view !== 2 || !active)
    ? PAD + Math.max(44, SEC_H + MODELS.length * ROW_H)
    : PAD + Math.max(44, HEAD_H + SEARCH_H + (rows.length === 0 ? EMPTY_H + LIST_PAD_B
      : Math.min(rows.length * MODEL_H + LIST_PAD_B, LIST_MAX_H))));

  const providerNodes = MODELS.map((g) => `<button class="${P}-row" type="button" aria-expanded="${view === 2 && sub === g.group}">
      <span class="${P}-rowName">${g.group}</span>
      <span class="${P}-rowDot"${g.group === CUR ? '' : ' hidden'} aria-hidden="true"></span>
      ${svg(ICON.chevron, '11px').replace('style="', `class="${P}-rowChev" style="`)}
    </button>`).join('');

  const modelNodes = rows.map(([name, sel, lv]) => `
    <button class="${P}-model${sel ? ' sel' : ''}${lv === 0 ? ' na' : ''}" type="button" role="menuitemradio" aria-checked="${sel}">
      <span class="${P}-modelName"><span>${name}</span><span class="${P}-cnt">${lv === 0 ? '不支持' : lv + ' 档'}</span></span>
      ${svg(ICON.check, '15px').replace('style="', `class="${P}-ck" style="`)}
    </button>`).join('') || `<div class="${P}-empty">没有匹配的模型</div>`;

  return `
  <div class="${P}-root">
  <div class="${P}-popover" style="--${P}-height:${h}px">
    <div class="${P}-pane ${P}-models">
      <div class="${P}-viewport${view === 2 ? ' view2' : ''}">
        <div class="${P}-page slot1">
          <div class="${P}-sec">切换模型</div>
          <div class="${P}-rows">${providerNodes}</div>
        </div>
        <div class="${P}-page slot2">
          <div class="${P}-head">
            <button class="${P}-back" type="button" aria-label="返回">${svg(ICON.back, '12px')}</button>
            <span class="${P}-title">${active ? active.group : ''}</span>
          </div>
          <label class="${P}-search">${svg(ICON.search, '13px')}<input type="text" value="${query}" placeholder="搜索模型…"></label>
          <div class="${P}-list">${modelNodes}</div>
        </div>
      </div>
    </div>
  </div></div>`;
}

function trigger(id, model = '6 Astra', opts = {}) {
  const e = EFFORTS[idxOf(id)];
  const fast = !!opts.fast;
  /* The real component only renders the bolt in the collapsed seat while Fast
     is on (`fast ? h('svg', { className: '-bolt' }) : null`). */
  const bolt = fast
    ? `<svg class="${P}-bolt" viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:16px"><path d="${ICON.bolt}"/></svg>`
    : '';
  return `<div class="${P}-root" style="display:inline-flex">
  <button class="${P}-trigger${id === 'max' ? ' peak' : ''}${fast ? ' fast' : ''}" style="--${P}-ink:${INK[id]}">
    ${bolt}
    <span class="${P}-caption">${model} <span class="${P}-triggerEffort">${e.label}</span></span>
    ${svg(ICON.down, '12px').replace('style="', `class="${P}-chev" style="`)}
  </button></div>`;
}

/* ---------- page scaffolding ---------- */
const TOKENS = `
:root{
  --dsw-font-family:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  --dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-bg-layer-3:#f1f2f4;
  --dsw-alias-label-primary:#15171b;
  --dsw-alias-label-secondary:#707073;
  --dsw-alias-label-tertiary:#9aa0ab;
  --dsw-alias-label-caption:#7c8290;
  --dsw-alias-border-l1:rgba(0,0,0,.08);
  --dsw-alias-interactive-bg-hover:rgba(20,22,26,.055);
  --dsw-specific-menu:#ffffff;
  --dsw-elevation-panel:0 0 0 .5px rgba(0,0,0,.05),0 5px 18px rgba(0,0,0,.10);
  --dsw-menu-backdrop-filter:none;
  --dsw-focus-ring-color:#3989e9;
  --dsw-alias-state-business-primary:#3989e9;
  --dsw-alias-state-error-primary:#e5484d;
}
`;
const HARNESS = `
/* ---- preview-only scaffolding (NOT part of the plugin) ---- */
html,body{margin:0;padding:0}
body{background:#eef1f6;font-family:var(--dsw-font-family);color:#15171b;-webkit-font-smoothing:antialiased}
.canvas{position:relative;overflow:hidden}
${/* the popover is position:fixed in production; here it is laid out in flow */''}
.host{position:relative}
.host .${P}-popover{position:absolute!important;bottom:auto!important;left:0!important;top:0!important}
.host .${P}-pane{position:absolute}
.hostList .${P}-popover{position:static!important;bottom:auto!important;left:auto!important;top:auto!important}
/* freeze animations so screenshots are deterministic */
.${P}-sp,.${P}-popover.peak .${P}-fill,.${P}-popover.peak .${P}-fill::before{animation-play-state:paused!important}
/* the tooltip is opacity:0 by default; force it visible for the Fast shot.
   It is a position:fixed layer in production precisely BECAUSE the popover
   clips its children — so the shot must place it outside the popover too. */
.tipLayer .${P}-tip{opacity:1!important;visibility:visible!important}
/* the in-pane copy stays hidden; the shot shows the unclipped overlay instead */
.tipLayer .${P}-fast .${P}-tip{display:none}
`;
/* The plugin's own rules only apply inside `.cmes-root`; the harness styles
   above are scoped so they can never leak into the shipped CSS. */

const page = (title, body, w, h) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>${TOKENS}${css}${HARNESS}
.canvas{width:${w}px;height:${h}px}
</style></head>
<body><div class="canvas">${body}</div></body></html>`;

/* ---------- the shots ---------- */
const shots = [];

/* 1. hero: the three surfaces side by side — effort pane, provider list
   (level 1) and that provider's models (level 2) — plus the collapsed trigger */
shots.push({
  name: 'hero',
  w: 1160, h: 618,
  html: page('hero', `
  <div style="position:absolute;inset:0;background:
      radial-gradient(900px 460px at 10% -10%, #dfe9ff 0%, transparent 58%),
      radial-gradient(820px 520px at 98% 104%, #ece2ff 0%, transparent 60%),
      linear-gradient(180deg,#f7f9fd 0%,#eef1f8 100%)"></div>
  <div style="position:absolute;left:0;right:0;top:0;padding:52px 60px 0">
    <div style="font-size:13px;font-weight:700;letter-spacing:.16em;color:#7c8290">DEEPSEEK HARNESS · CLIENT PLUGIN</div>
    <div style="margin-top:12px;font-size:38px;font-weight:650;letter-spacing:-.01em;color:#0f1116">
      把 Codex 的模型选择器，搬进 DSH 输入框
    </div>
    <div style="margin-top:10px;font-size:15px;color:#5b6270">一个入口 · 两块面板 · 逐像素复刻的推理强度滑条</div>
  </div>

  <div style="position:absolute;left:0;right:0;top:250px;display:flex;gap:34px;align-items:flex-start;justify-content:center">
    <div style="flex:0 0 auto">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">
        <span style="color:#8b46ee">①</span> 推理强度 · ULTRA
      </div>
      <div class="host" style="width:272px;height:104px">${effortPane('max')}</div>
      <div style="margin-top:16px;font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">收起态</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        ${trigger('low')}${trigger('high')}${trigger('max')}
      </div>
    </div>
    <div style="flex:0 0 auto">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">
        <span style="color:#3a83f7">②</span> 模型列表 · 第一级 PROVIDER
      </div>
      <div class="hostList" style="width:272px">${modelsPane({ view: 1 })}</div>
    </div>
    <div style="flex:0 0 auto">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">
        <span style="color:#3a83f7">③</span> 第二级 · 模型 + 搜索
      </div>
      <div class="hostList" style="width:272px">${modelsPane({ view: 2, sub: 'Trae' })}</div>
    </div>
  </div>
  `, 1160, 618)
});

/* 2. the seven stops, one colour each */
shots.push({
  name: 'effort-levels',
  w: 1240, h: 660,
  html: page('effort levels', `
  <div style="position:absolute;inset:0;background:#f4f6fa"></div>
  <div style="position:absolute;left:44px;top:34px;font-size:19px;font-weight:650;color:#0f1116">七档等距 · 每档一色</div>
  <div style="position:absolute;left:44px;top:64px;font-size:13px;color:#5b6270">填充 / 轨道底色 / 标题文字 同步换色，色相从蓝 216.6° 单调推进到紫罗兰 263.9°</div>
  <div style="position:absolute;left:44px;top:112px;display:flex;flex-wrap:wrap;gap:22px 26px">
    ${EFFORTS.map((e) => `
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">
          ${e.label.toUpperCase()} · <code style="font-family:ui-monospace,Consolas,monospace;text-transform:none;color:#3a83f7">${e.id}</code>
        </div>
        <div class="host" style="width:272px;height:104px">${effortPane(e.id)}</div>
      </div>`).join('')}
  </div>
  `, 1240, 660)
});

/* 3. model pane: provider list + drill-down + search */
shots.push({
  name: 'model-panel',
  w: 1180, h: 620,
  html: page('model panel', `
  <div style="position:absolute;inset:0;background:#f4f6fa"></div>
  <div style="position:absolute;left:44px;top:32px;font-size:19px;font-weight:650;color:#0f1116">模型面板 · 两级下钻</div>
  <div style="position:absolute;left:44px;top:62px;font-size:13px;color:#5b6270">第一级列出 provider（当前模型所在组带蓝点）→ 点开横向滑入该 provider 的模型与搜索框</div>
  <div style="position:absolute;left:44px;top:112px;display:flex;gap:26px;align-items:flex-start">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">第一级 · PROVIDER</div>
      <div class="hostList" style="width:272px">${modelsPane({ view: 1 })}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">第二级 · 模型 + 搜索「5」</div>
      <div class="hostList" style="width:272px">${modelsPane({ view: 2, sub: 'Trae', query: '5' })}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">第二级 · 无匹配</div>
      <div class="hostList" style="width:272px">${modelsPane({ view: 2, sub: 'Trae', query: 'zzz' })}</div>
    </div>
  </div>
  `, 1180, 620)
});

/* 4. Fast: the same non-Ultra stop with Fast off and on, plus the collapsed
   seat. Using `high` (not Ultra) isolates what Fast alone changes, so the
   particles cannot be mistaken for the peak treatment. */
shots.push({
  name: 'fast',
  w: 1160, h: 392,
  html: page('fast mode', `
  <div style="position:absolute;inset:0;background:#f4f6fa"></div>
  <div style="position:absolute;left:48px;top:32px;font-size:19px;font-weight:650;color:#0f1116">Fast 开关 · 开 / 关对比</div>
  <div style="position:absolute;left:48px;top:62px;font-size:13px;color:#5b6270">
    同一个「高」档位下对比：⚡ 由描边变实心、轨道亮起星尘粒子，收起态也多一颗 ⚡
  </div>

  <div style="position:absolute;left:48px;top:118px;display:flex;gap:32px;align-items:flex-start">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">FAST 关</div>
      <div class="host" style="width:272px;height:120px">${effortPane('high', { fast: false })}</div>
      <div style="margin-top:16px;font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">收起态</div>
      <div>${trigger('high')}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#3988f6;margin-bottom:10px">FAST 开</div>
      <div class="host" style="width:272px;height:120px">${effortPane('high', { fast: true })}</div>
      <div style="margin-top:16px;font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:10px">收起态</div>
      <div>${trigger('high', '6 Astra', { fast: true })}</div>
    </div>
  </div>

  <div style="position:absolute;left:790px;top:118px;width:320px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:12px">FAST 改变什么</div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:11px">
        <div style="width:3px;border-radius:2px;background:#3988f6;flex:none"></div>
        <div style="font-size:13px;color:#3c414a;line-height:1.6">
          <b style="color:#0f1116">⚡ 图标变实心</b><br>描边 1.7 → 填充实心 + 0.7 细描边，并染成蓝色
        </div>
      </div>
      <div style="display:flex;gap:11px">
        <div style="width:3px;border-radius:2px;background:#3988f6;flex:none"></div>
        <div style="font-size:13px;color:#3c414a;line-height:1.6">
          <b style="color:#0f1116">轨道亮起星尘</b><br>粒子原本只在 Ultra 出现，Fast 让<b>任何档位</b>都能亮起
        </div>
      </div>
      <div style="display:flex;gap:11px">
        <div style="width:3px;border-radius:2px;background:#3988f6;flex:none"></div>
        <div style="font-size:13px;color:#3c414a;line-height:1.6">
          <b style="color:#0f1116">收起态多一颗 ⚡</b><br>输入框上的按钮同时出现闪电图标
        </div>
      </div>
      <div style="display:flex;gap:11px">
        <div style="width:3px;border-radius:2px;background:#b6b6b8;flex:none"></div>
        <div style="font-size:13px;color:#3c414a;line-height:1.6">
          <b style="color:#0f1116">不改变真实速度或用量</b><br>纯视觉效果 —— 与 Ultra 的额度警示一样只是表达
        </div>
      </div>
    </div>
  </div>
  `, 1160, 392)
});

/* 5. fast tooltip + ultra warning */
shots.push({
  name: 'details',
  w: 800, h: 470,
  html: page('details', `
  <div style="position:absolute;inset:0;background:#f4f6fa"></div>
  <div style="position:absolute;left:44px;top:32px;font-size:19px;font-weight:650;color:#0f1116">两个细节</div>
  <div style="position:absolute;left:44px;top:62px;font-size:13px;color:#5b6270">Fast 说明用 fixed 层，不再被弹层裁切；Ultra 档短暂显示额度警示</div>
  <div style="position:absolute;left:44px;top:186px;display:flex;gap:34px;align-items:flex-start">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">FAST 说明浮层</div>
      <div class="host tipLayer" style="width:272px;height:200px">${effortPane('high', { fast: true })}
        <span class="${P}-tip" style="position:absolute;left:88px;top:-56px;text-align:left">
          <span class="${P}-tipTitle">1.5 倍速</span><span>用量更多</span><span>(仅视觉效果)</span>
        </span>
      </div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#7c8290;margin-bottom:8px">ULTRA 进入瞬间</div>
      <div class="host" style="width:272px;height:200px">${effortPane('max', { message: true })}</div>
    </div>
  </div>
  `, 800, 470)
});

/* ---------- write + screenshot ---------- */
const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'
];
const browser = CANDIDATES.find((p) => existsSync(p)) || null;

let done = 0;
for (const s of shots) {
  const htmlPath = join(OUT, `${s.name}.html`);
  writeFileSync(htmlPath, s.html, 'utf8');
  if (!browser) { console.log(`wrote ${s.name}.html (no browser found — PNG skipped)`); continue; }
  const png = join(OUT, `${s.name}.png`);
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--screenshot=${png}`, `--window-size=${s.w},${s.h}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`
  ], { stdio: 'ignore', timeout: 60000 });
  const size = readFileSync(png).length;
  console.log(`wrote docs/images/${s.name}.png (${s.w}x${s.h} @2x, ${size} bytes)`);
  done++;
}
console.log(`\n${done}/${shots.length} PNGs generated${browser ? '' : ' (browser missing)'}`);
