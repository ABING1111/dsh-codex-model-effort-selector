/**
 * Screenshot the light vs dark effort pane side by side, from the REAL CSS.
 * Usage: node test/make-dark-shot.mjs  ->  docs/images/dark-mode.png
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
const FILL = pick('EFFORT_FILL'), INK = pick('EFFORT_INK');
const FILL_DARK = pick('EFFORT_FILL_DARK'), INK_DARK = pick('EFFORT_INK_DARK');

const EFFORTS = [
  { id: 'off', label: '关闭' }, { id: 'minimal', label: '极低' },
  { id: 'low', label: '轻度' }, { id: 'medium', label: '中' },
  { id: 'high', label: '高' }, { id: 'xhigh', label: '极高' },
  { id: 'max', label: 'Ultra' }
];

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function svg(d, size) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${size};height:${size};flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="${d}"/></svg>`;
}
const I = {
  chevron: 'm9 18 6-6-6-6', reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
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

function pane(index, theme, opts = {}) {
  const e = EFFORTS[index];
  const fill = theme === 'dark' ? FILL_DARK : FILL;
  const ink = theme === 'dark' ? INK_DARK : INK;
  const peak = e.id === 'max';
  const pos = index / (EFFORTS.length - 1);
  const message = !!opts.message;
  const dots = EFFORTS.map((_, i) =>
    `<i class="${P}-dot${i <= index ? ' passed' : ''}" style="--${P}-tick:${i / (EFFORTS.length - 1)}"></i>`).join('');
  const title = (peak || message) ? '' : `<span class="${P}-heading">${e.label}${svg(I.chevron, '10px')}</span>`;
  return `
  <div class="${P}-root" data-theme="${theme}">
  <div class="${P}-popover${peak ? ' peak' : ''}${message ? ' message' : ''}" style="--${P}-ink:${ink[e.id]}">
    <div class="${P}-pane ${P}-main">
      <button class="${P}-tool ${P}-fast">${svg(I.bolt, '15px')}</button>
      <button class="${P}-modelLink">${title}<span class="${P}-modelName">6 Astra</span></button>
      <div class="${P}-warning"><span>更快消耗使用额度</span></div>
      <button class="${P}-tool ${P}-reset">${svg(I.reset, '16px')}</button>
      <div class="${P}-rail" style="--${P}-fill:${fill[e.id]};--${P}-track:${mixHex(theme === 'dark' ? '#232324' : '#e8e7e8', fill[e.id], 0.22)};--${P}-dot:var(--dsw-alias-label-caption,#b6b6b8);--${P}-pos:${pos}">
        <div class="${P}-fill"></div>${dots}
        <div class="${P}-sparks">${peak ? sparkles() : ''}</div>
        <div class="${P}-knob"></div>
      </div>
    </div>
  </div></div>`;
}

function triggerRow(index, theme) {
  const e = EFFORTS[index];
  const ink = theme === 'dark' ? INK_DARK[e.id] : INK[e.id];
  return `
  <div class="${P}-root" style="display:inline-flex" data-theme="${theme}">
  <button class="${P}-trigger${e.id === 'max' ? ' peak' : ''}" style="--${P}-ink:${ink}">
    <span class="${P}-caption">6 Astra <span class="${P}-triggerEffort">${e.label}</span></span>
    ${svg(I.chevron, '12px').replace('style="', `class="${P}-chev" style="`)}
  </button></div>`;
}

const CHROME = (t) => t === 'dark'
  ? `--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#cfd3d6;
     --dsw-alias-label-tertiary:#adb2b8;--dsw-alias-label-caption:#81858c;--dsw-alias-border-l1:#ffffff0f;
     --dsw-alias-interactive-bg-hover:#ffffff14;--dsw-specific-menu:#43454a73;
     --dsw-elevation-panel:0 0 0 .5px #ffffff0f,0 3px 8px 0 #00000014,0 0 16px 0 #0000000a;
     --dsw-menu-backdrop-filter:none;color-scheme:dark;`
  : `--dsw-alias-bg-layer-2:#ffffff;--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;
     --dsw-alias-label-tertiary:#81858c;--dsw-alias-label-caption:#adb2b8;--dsw-alias-border-l1:rgba(0,0,0,.07);
     --dsw-alias-interactive-bg-hover:#2631480f;--dsw-specific-menu:#f8f9fa94;
     --dsw-elevation-panel:0 0 0 .5px rgba(0,0,0,.07),0 3px 8px 0 #00000008,0 0 16px 0 #00000005;
     --dsw-menu-backdrop-filter:none;`;

const column = (theme, title) => `
  <div class="col ${theme}">
    <div class="label">${title}</div>
    ${EFFORTS.map((_, i) => `<div class="host">${pane(i, theme)}</div>`).join('')}
    <div class="label">Ultra 警示态</div>
    <div class="host">${pane(6, theme, { message: true })}</div>
    <div class="label">收起态按钮</div>
    <div class="triggers">${triggerRow(4, theme)}${triggerRow(6, theme)}</div>
  </div>`;

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${css}
*{animation:none!important;transition:none!important}
body{margin:0;padding:20px;background:#d9dce1;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.stage{display:flex;gap:22px;align-items:flex-start}
.col{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:12px}
.col.light{background:#f8f8f8}
.col.dark{background:#151517}
.label{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.light .label{color:#707073}.dark .label{color:#8a8f98}
.host{position:relative;width:272px;height:104px}
.host .${P}-popover{position:absolute!important;bottom:auto!important;left:0!important;top:0!important}
.triggers{display:flex;gap:8px;align-items:center;min-height:34px}
/* per-theme chrome, exactly as the shipped tokens resolve */
.col.light{${CHROME('light')}}
.col.dark{${CHROME('dark')}}
/* the dark chrome block from client.js, applied per column */
.col.dark{--cmes-knob:#f9fafb;--cmes-dotPassed:#f9fafb;--cmes-accent:#7aaaff;--cmes-accentPeak:#c39bff;
  --cmes-accentHalo:rgba(122,170,255,.20);--cmes-warnHi:#c39bff;--cmes-warnLo:#f3e6ff;
  --cmes-peakGradient:linear-gradient(90deg,#3e89ff 0%,#438bff 10%,#518dff 20%,#668bff 30%,#7c8aff 40%,#9386ff 50%,#a084ff 55%,#a785ff 60%,#b085ff 65%,#b087ff 70%,#af8bff 75%,#ae8fff 80%,#ae91ff 85%,#af95ff 93%,#b296fe 100%);
  --dsw-elevation-stroke-color:rgba(176,133,255,.45)}
</style></head><body>
<div class="stage">
  ${column('light', '浅色 · v1.0.1（未改动）')}
  ${column('dark', '深色 · v1.0.1（本次修复）')}
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
    `--screenshot=${png}`, '--window-size=640,1120', '--default-background-color=00000000',
    new URL(import.meta.url).protocol === 'file:' ? 'file:///' + join(OUT, 'dark-mode.html').replace(/\\/g, '/') : ''
  ], { stdio: 'ignore' });
  console.log('wrote', png);
}
