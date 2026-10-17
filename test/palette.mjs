/**
 * Palette + geometry assertions for the per-effort colours.
 *
 * Every level must clear three WCAG floors, and the ladder must stay visually
 * ordered. Mirrors the constants in client.js so a drift in either place fails.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function cr(a, b) {
  const [la, lb] = [lum(a), lum(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- read the palette out of the shipped source ----------------------------
const fillBlock = src.match(/const EFFORT_FILL = \{([\s\S]*?)\};/);
const inkBlock = src.match(/const EFFORT_INK = \{([\s\S]*?)\};/);
assert.ok(fillBlock, 'EFFORT_FILL not found');
assert.ok(inkBlock, 'EFFORT_INK not found');

const parse = block => {
  const out = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*'(#[0-9a-fA-F]{6})'/g)) out[m[1]] = m[2];
  return out;
};
const FILL = parse(fillBlock);
const INK = parse(inkBlock);

const RAIL = '#e8e7e8';
const CARD = '#f8f8f8';
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};

/** Hue angle in degrees (0..360) — the axis the ramp is actually ordered by. */
function hue(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let hh;
  if (max === r) hh = ((g - b) / d) % 6;
  else if (max === g) hh = (b - r) / d + 2;
  else hh = (r - g) / d + 4;
  return ((hh * 60) + 360) % 360;
}

check('palette covers the whole Codex ladder', () => {
  assert.deepEqual(Object.keys(FILL).sort(), [...LEVELS].sort());
  assert.deepEqual(Object.keys(INK).sort(), [...LEVELS].sort());
});

check('every fill is visible against the unfilled rail (>= 2.5)', () => {
  for (const k of LEVELS) {
    const v = cr(FILL[k], RAIL);
    assert.ok(v >= 2.5, `${k} fill ${FILL[k]} vs rail = ${v.toFixed(2)} (< 2.5)`);
  }
});

check('the white knob stays readable on every fill (>= 2.2)', () => {
  for (const k of LEVELS) {
    const v = cr('#ffffff', FILL[k]);
    assert.ok(v >= 2.2, `${k} white vs ${FILL[k]} = ${v.toFixed(2)} (< 2.2)`);
  }
});

check('every heading ink passes AA body text (>= 4.5)', () => {
  for (const k of LEVELS) {
    const v = cr(INK[k], CARD);
    assert.ok(v >= 4.5, `${k} ink ${INK[k]} vs card = ${v.toFixed(2)} (< 4.5)`);
  }
});

check('off is neutral, not a washed-out blue', () => {
  const h = FILL.off.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, `off ${FILL.off} is not neutral`);
});

/* The ordering axis is HUE: blue drifts to violet as effort rises.
 * Luminance is intentionally NOT monotonic — violet is darker than blue at
 * equal saturation, so a darkening ramp would force `max` toward pink. */
check('hue advances monotonically blue -> violet (the real ordering axis)', () => {
  const ramp = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const hues = ramp.map(k => hue(FILL[k]));
  for (let i = 1; i < hues.length; i++) {
    assert.ok(
      hues[i] >= hues[i - 1] - 1,
      `${ramp[i - 1]} hue ${hues[i - 1].toFixed(1)}deg should not go backwards to ${ramp[i]} ${hues[i].toFixed(1)}deg`
    );
  }
  assert.ok(hues[hues.length - 1] - hues[0] > 30, 'the ramp must span a visible hue range');
});

check('every fill stays reasonably saturated (never washes to grey)', () => {
  for (const k of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const h = FILL[k].replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    assert.ok(sat >= 0.5, `${k} ${FILL[k]} saturation ${sat.toFixed(2)} < 0.5 (too grey)`);
  }
});

check('max is the most violet end of the ramp', () => {
  const h = FILL.max.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  assert.ok(b > r && r > g, `max ${FILL.max} should be violet (b > r > g)`);
});

check('every level has a DISTINCT fill (no accidental duplicates)', () => {
  const seen = new Map();
  for (const k of LEVELS) {
    assert.ok(!seen.has(FILL[k]), `${k} duplicates ${seen.get(FILL[k])} (${FILL[k]})`);
    seen.set(FILL[k], k);
  }
});

check('the fill/track mixing helper is present', () => {
  assert.match(src, /function mixHex\(a, b, t\)/);
  assert.match(src, /mixHex\('#e8e7e8', fillFor\(displayed\), 0\.22\)/);
});

let failed = 0;
for (const [s, n] of results) {
  if (s === 'ok') console.log(`  ok   ${n}`);
  else { failed++; console.log(`  FAIL ${n}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
