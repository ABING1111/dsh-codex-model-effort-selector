/**
 * Generate the README's dark-mode showcase from the plugin's REAL CSS.
 *
 * Single-theme (dark only) composition: a hero pane floating above a hint of
 * the composer, then every level rendered on its own card (the eighth cell is
 * the Ultra warning state). No comparison column — the light theme is
 * documented by the other shots.
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
/** One full popover pane at a given level. */
function pane(index, opts = {}) {
  const e = EFFORTS[index];
  const peak = e.id === 'max';
  const pos = index / (EFFORTS.length - 1);
  const message = !!opts.message;
  const dots = EFFORTS.map((_, i) =>
    `<i class="${P}-dot${i <= index ? ' passed' : ''}" style="--${P}-tick:${i / (EFFORTS.length - 1)}"></i>`).join('');
  const title = (peak || message) ? '' : `<span class="${P}-heading">${e.label}${svg(I.chevron, '10px')}</span>`;
  return `
  <div class="${P}-root" style="width:272px">
  <div class="${P}-popover${peak ? ' peak' : ''}${message ? ' message' : ''}" style="--${P}-ink:${INK_DARK[e.id]}">
    <div class="${P}-pane ${P}-main">
      <button class="${P}-tool ${P}-fast${opts.fast ? ' active' : ''}">${svg(I.bolt, '15px')}</button>
      <button class="${P}-modelLink">${title}<span class="${P}-modelName">${opts.model || '6 Astra'}</span></button>
      <div class="${P}-warning"><span>更快消耗使用额度</span></div>
      <button class="${P}-tool ${P}-reset">${svg(I.reset, '16px')}</button>
      <div class="${P}-rail" style="--${P}-fill:${FILL_DARK[e.id]};--${P}-track:${TRACK(e.id)};--${P}-dot:var(--dsw-alias-label-caption,#b6b6b8);--${P}-pos:${pos}">
        <div class="${P}-fill"></div>${dots}
        <div class="${P}-sparks">${peak ? sparkles() : ''}</div>
        <div class="${P}-knob"></div>
      </div>
    </div>
  </div></div>`;
}

/** The collapsed trigger seat. */
function trigger(index) {
  const e = EFFORTS[index];
  return `
  <div class="${P}-root" style="display:inline-flex">
  <button class="${P}-trigger${e.id === 'max' ? ' peak' : ''}" style="--${P}-ink:${INK_DARK[e.id]}">
    <span class="${P}-caption">6 Astra <span class="${P}-triggerEffort">${e.label}</span></span>
    ${svg(I.down, '12px').replace('style="', `class="${P}-chev" style="`)}
  </button></div>`;
}

/* ------------------------------------------------------------------ layout -- */
function hero() {
  return `
  <div class="hero">
    <div class="composer">
      <div class="heroHost">${pane(4, { fast: true })}</div>
      <div class="seatRow">
        ${trigger(4)}
        ${trigger(6)}
        ${trigger(0)}
      </div>
      <div class="seatHint">收起态 · 档位色跟随当前档</div>
    </div>
  </div>`;
}

/* 8 cells: the seven levels + the Ultra warning state. */
function specimens() {
  const card = (i, head, opts = {}) => `
    <div class="cell">
      <div class="cellHead">${head}</div>
      <div class="cellBody">${pane(i, opts)}</div>
    </div>`;
  const head = (i, name, en) => `
    <span class="swatch" style="background:${FILL_DARK[EFFORTS[i].id]}"></span>
    <span class="cellName">${name}</span>
    <span class="cellEn" style="color:${INK_DARK[EFFORTS[i].id]}">${en}</span>
    <span class="cellHex">${FILL_DARK[EFFORTS[i].id]}</span>`;
  const cells = EFFORTS.map((e, i) => card(i, head(i, e.label, e.en)));
  cells.push(card(6, head(6, 'Ultra · 警示', 'Quota warning'), { message: true }));
  return `
  <div class="section">
    <div class="sectionTitle">七档实渲染 + 警示态</div>
    <div class="grid">${cells.join('')}</div>
  </div>`;
}

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>dark-mode</title>
<style>${css}
*{animation:none!important;transition:none!important}
body{margin:0;background:#0c0c0e;color:#e9e9ec;
  font-family:"Segoe UI Variable Text","Segoe UI",system-ui,"Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased}
.canvas{width:720px;padding:36px 40px 34px;box-sizing:border-box;
  background:
    radial-gradient(620px 300px at 10% -8%, rgba(146,143,255,.14), transparent 62%),
    radial-gradient(520px 280px at 94% 0%, rgba(189,145,255,.11), transparent 60%),
    linear-gradient(180deg,#131316 0%,#0c0c0e 100%)}
.masthead{display:flex;align-items:baseline;gap:12px;margin-bottom:24px}
.mastheadTitle{font-size:19px;font-weight:600;letter-spacing:.01em}
.mastheadSub{margin-left:auto;font-size:11px;color:#77787f}
.mastheadRule{flex:1;height:.5px;background:rgba(255,255,255,.10);align-self:center}

/* ---- hero: the popover floating above a hint of the composer ---- */
.hero{display:flex;justify-content:center;margin:4px 0 26px}
.composer{position:relative;width:340px;padding:18px 34px 14px;border-radius:16px;
  background:#1b1b1f;
  box-shadow:0 0 0 .5px rgba(255,255,255,.07),0 20px 48px rgba(0,0,0,.55)}
.heroHost{position:relative;width:272px;height:104px;margin:0 auto}
.heroHost .${P}-popover{position:absolute!important;bottom:auto!important;left:0!important;top:0!important}
.seatRow{display:flex;gap:6px;justify-content:center;margin-top:12px}
.seatHint{text-align:center;font-size:10.5px;color:#6f7076;margin-top:7px}

/* ---- specimen grid ---- */
.section{margin-bottom:4px}
.sectionTitle{font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
  color:#8a8f98;margin:0 0 12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cell{border-radius:12px;padding:11px 12px 9px;background:#17171a;
  box-shadow:0 0 0 .5px rgba(255,255,255,.055)}
.cellHead{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.swatch{width:9px;height:9px;border-radius:3px;flex:none}
.cellName{font-size:12.5px;font-weight:600;color:#e9e9ec}
.cellEn{font-size:10.5px}
.cellHex{margin-left:auto;font-size:9.5px;color:#6f7076;font-family:Consolas,monospace}
/* each cell hosts its own fixed-positioned popover, pinned to the card */
.cellBody{position:relative;width:272px;height:104px;margin:0 auto}
.cellBody .${P}-popover{position:absolute!important;bottom:auto!important;left:0!important;top:0!important}

/* shipped dark chrome, pinned for this standalone page (in the real client it
   resolves from body[data-ds-dark-theme]) */
.canvas{
  --dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-label-primary:#f9fafb;
  --dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;
  --dsw-alias-label-caption:#81858c;--dsw-alias-border-l1:#ffffff0f;
  --dsw-alias-interactive-bg-hover:#ffffff14;--dsw-specific-menu:#43454a73;
  --dsw-elevation-panel:0 0 0 .5px #ffffff0f,0 3px 8px 0 #00000014,0 0 16px 0 #0000000a;
  --dsw-menu-backdrop-filter:none;
  /* the dark block from client.js */
  --cmes-knob:#f9fafb;--cmes-knobShadow:rgba(0,0,0,.45);
  --cmes-dotPassed:#f9fafb;
  --cmes-accent:#7aaaff;--cmes-accentPeak:#c39bff;--cmes-accentHalo:rgba(122,170,255,.20);
  --cmes-warnHi:#c39bff;--cmes-warnLo:#f3e6ff;
  --cmes-peakGradient:${PEAK_GRADIENT};
  --dsw-elevation-stroke-color:rgba(176,133,255,.45)}
</style></head><body>
<div class="canvas">
  <div class="masthead">
    <span class="mastheadTitle">深色模式</span>
    <span class="mastheadRule"></span>
    <span class="mastheadSub">dsh-codex-model-effort-selector · v1.0.1</span>
  </div>
  ${hero()}
  ${specimens()}
</div>
</body></html>`;

writeFileSync(join(OUT, 'dark-mode.html'), html, 'utf8');

/* ---------- screenshot ---------- */
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = BROWSERS.find(b => existsSync(b));
const png = join(OUT, 'dark-mode.png');
if (!browser) {
  console.log('no browser found — wrote dark-mode.html only');
} else {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--screenshot=${png}`, '--window-size=720,992', '--default-background-color=00000000',
    'file:///' + join(OUT, 'dark-mode.html').replace(/\\/g, '/')
  ], { stdio: 'ignore' });
  console.log('wrote', png);
}
