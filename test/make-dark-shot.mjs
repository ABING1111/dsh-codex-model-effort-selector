/**
 * Generate the README's dark-mode shot from the plugin's REAL CSS.
 *
 * Landscape, single dark theme — laid out exactly like the other README shots
 * (make-readme-shots.mjs): same header rhythm, same 11px uppercase labels,
 * same 2x rendering — only the palette is the shipped dark theme.
 *
 * Usage:  node test/make-dark-shot.mjs   ->  docs/images/dark-mode.png
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
const cssStart = src.indexOf('const CSS = `');
const cssEnd = src.indexOf('`;', cssStart);
const P = 'cmes';
const css = src.slice(cssStart + 'const CSS = `'.length, cssEnd).replaceAll('${P}', P);

/* read the palettes straight out of the source so the shot cannot drift */
const pick = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
  if (!m) throw new Error(`${name} not found`);
  const out = {};
  for (const kv of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[kv[1]] = kv[2];
  return out;
};
const FILL_DARK = pick('EFFORT_FILL_DARK');
const INK_DARK = pick('EFFORT_INK_DARK');
const PEAK_GRADIENT = src.match(/--\$\{P\}-peakGradient:([^;"]+)/)?.[1]
  ?.replaceAll('${P}', P) ?? '';
if (!PEAK_GRADIENT.includes('linear-gradient')) throw new Error('peak gradient not found');

const EFFORTS = [
  { id: 'off', label: '关闭', en: 'Off' },
  { id: 'minimal', label: '极低', en: 'Minimal' },
  { id: 'low', label: '轻度', en: 'Light' },
  { id: 'medium', label: '中', en: 'Medium' },
  { id: 'high', label: '高', en: 'High' },
  { id: 'xhigh', label: '极高', en: 'Extra High' },
  { id: 'max', label: 'Ultra', en: 'Ultra' }
];
const idxOf = (id) => EFFORTS.findIndex((e) => e.id === id);

/* ---------------------------------------------------------------- helpers -- */
function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function svg(d, size) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${size};height:${size};flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="${d}"/></svg>`;
}
const I = {
  chevron: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6', reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
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

const TRACK = id => mixHex('#232324', FILL_DARK[id], 0.22);

/* ------------------------------------------------------------- components -- */
/** One full popover pane at a given level (mirrors effortPane in make-readme-shots). */
function effortPane(id, opts = {}) {
  const e = EFFORTS[idxOf(id)];
  const peak = id === 'max';
  const index = idxOf(id);
  const pos = index / (EFFORTS.length - 1);
  const message = !!opts.message;
  const dots = EFFORTS.map((_, i) =>
    `<i class="${P}-dot${i <= index ? ' passed' : ''}" style="--${P}-tick:${i / (EFFORTS.length - 1)}"></i>`).join('');
  const title = (peak || message) ? '' : `<span class="${P}-heading">${e.label}${svg(I.chevron, '10px')}</span>`;
  return `
  <div class="${P}-root">
  <div class="${P}-popover${peak ? ' peak' : ''}${message ? ' message' : ''}" style="--${P}-ink:${INK_DARK[id]}">
    <div class="${P}-pane ${P}-main">
      <button class="${P}-tool ${P}-fast${opts.fast ? ' active' : ''}">${svg(I.bolt, '15px')}</button>
      <button class="${P}-modelLink">${title}<span class="${P}-modelName">${opts.model || '6 Astra'}</span></button>
      <div class="${P}-warning"><span>更快消耗使用额度</span></div>
      <button class="${P}-tool ${P}-reset">${svg(I.reset, '16px')}</button>
      <div class="${P}-rail" style="--${P}-fill:${FILL_DARK[id]};--${P}-track:${TRACK(id)};--${P}-dot:var(--dsw-alias-label-caption,#b6b6b8);--${P}-pos:${pos}">
        <div class="${P}-fill"></div>${dots}
        <div class="${P}-sparks">${peak ? sparkles() : ''}</div>
        <div class="${P}-knob"></div>
      </div>
    </div>
  </div></div>`;
}

/** The collapsed trigger seat (same shape as make-readme-shots). */
function trigger(id, opts = {}) {
  const e = EFFORTS[idxOf(id)];
  const bolt = opts.fast
    ? `<svg class="${P}-bolt" viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:16px"><path d="${I.bolt}"/></svg>`
    : '';
  return `<div class="${P}-root" style="display:inline-flex">
  <button class="${P}-trigger${id === 'max' ? ' peak' : ''}${opts.fast ? ' fast' : ''}" style="--${P}-ink:${INK_DARK[id]}">
    ${bolt}
    <span class="${P}-caption">6 Astra <span class="${P}-triggerEffort">${e.label}</span></span>
    ${svg(I.down, '12px').replace('style="', `class="${P}-chev" style="`)}
  </button></div>`;
}

/* ------------------------------- scaffolding (mirrors make-readme-shots) --- */
const DARK_TOKENS = `
/* shipped dark tokens — in the real client these resolve from
   body[data-ds-dark-theme]; here they are pinned to the canvas */
.canvas{
  --dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-layer-3:#353638;
  --dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#cfd3d6;
  --dsw-alias-label-tertiary:#adb2b8;--dsw-alias-label-caption:#81858c;
  --dsw-alias-border-l1:#ffffff0f;
  --dsw-alias-interactive-bg-hover:#ffffff14;--dsw-specific-menu:#43454a73;
  --dsw-elevation-panel:0 0 0 .5px #ffffff0f,0 3px 8px 0 #00000014,0 0 16px 0 #0000000a;
  --dsw-menu-backdrop-filter:none;
  /* the dark block from client.js */
  --cmes-knob:#f9fafb;--cmes-knobShadow:rgba(0,0,0,.45);
  --cmes-dotPassed:#f9fafb;
  --cmes-accent:#7aaaff;--cmes-accentPeak:#c39bff;--cmes-accentHalo:rgba(122,170,255,.20);
  --cmes-warnHi:#c39bff;--cmes-warnLo:#f3e6ff;
  --cmes-peakGradient:${PEAK_GRADIENT};
  --dsw-elevation-stroke-color:rgba(176,133,255,.45)}`;
const HARNESS = `
html,body{margin:0;padding:0}
body{background:#0f0f12;font-family:var(--dsw-font-family,system-ui);-webkit-font-smoothing:antialiased}
.canvas{position:relative;overflow:hidden;color:#f9fafb}
.host{position:relative}
.host .${P}-popover{position:absolute!important;bottom:auto!important;left:0!important;top:0!important}
/* freeze animations so the screenshot is deterministic */
.${P}-sp,.${P}-popover.peak .${P}-fill,.${P}-popover.peak .${P}-fill::before{animation-play-state:paused!important}`;

/* same header rhythm as make-readme-shots: 19px/650 title at 44/32,
   13px subtitle at 44/62, content row from top:112 */
const page = (title, subtitle, body, w, h) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>${css}${DARK_TOKENS}${HARNESS}
.canvas{width:${w}px;height:${h}px}
.label{font-size:11px;font-weight:700;letter-spacing:.1em;color:#8a8f98;margin-bottom:8px}
</style></head>
<body><div class="canvas">
  <div style="position:absolute;inset:0;background:
      radial-gradient(900px 460px at 8% -12%, rgba(146,143,255,.12) 0%, transparent 58%),
      radial-gradient(820px 520px at 99% 108%, rgba(189,145,255,.10) 0%, transparent 60%),
      linear-gradient(180deg,#17171a 0%,#0f0f12 100%)"></div>
  <div style="position:absolute;left:44px;top:32px;font-size:19px;font-weight:650;color:#f9fafb">${title}</div>
  <div style="position:absolute;left:44px;top:62px;font-size:13px;color:#a5a9b1">${subtitle}</div>
  ${body}
</div></body></html>`;

const W = 1180, H = 620;
const html = page(
  '深色模式 · 每档一色',
  '同一份 CSS 在官方深色表面下重新求解：主题判定读 body[data-ds-dark-theme]，切换即时变色，浅色主题逐位未动',
  `
  <div style="position:absolute;left:44px;top:112px;display:flex;flex-wrap:wrap;gap:22px 26px">
    ${EFFORTS.map((e) => `
      <div>
        <div class="label">${e.label.toUpperCase()} · <code style="font-family:ui-monospace,Consolas,monospace;text-transform:none;color:${FILL_DARK[e.id]}">${FILL_DARK[e.id]}</code></div>
        <div class="host" style="width:272px;height:104px">${effortPane(e.id)}</div>
      </div>`).join('')}
    <div>
      <div class="label">ULTRA · 警示</div>
      <div class="host" style="width:272px;height:104px">${effortPane('max', { message: true })}</div>
    </div>
    <div>
      <div class="label">收起态</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;width:272px;min-height:104px">
        ${trigger('high', { fast: true })}${trigger('max')}${trigger('off')}
      </div>
    </div>
  </div>
  `, W, H);

writeFileSync(join(OUT, 'dark-mode.html'), html, 'utf8');

/* ---------- screenshot ---------- */
const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = CANDIDATES.find(b => existsSync(b));
const png = join(OUT, 'dark-mode.png');
if (!browser) {
  console.log('no browser found — wrote dark-mode.html only');
} else {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--screenshot=${png}`, `--window-size=${W},${H}`,
    'file:///' + join(OUT, 'dark-mode.html').replace(/\\/g, '/')
  ], { stdio: 'ignore', timeout: 60000 });
  console.log(`wrote docs/images/dark-mode.png (${W}x${H} @2x, ${readFileSync(png).length} bytes)`);
}
