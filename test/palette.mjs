/**
 * Palette + geometry assertions for the per-effort colours.
 *
 * Every level must clear three WCAG floors — now IN BOTH THEMES — and the
 * ladder must stay visually ordered. Mirrors the constants in client.js so a
 * drift in either place fails.
 *
 * Dark surfaces are the shipped ones (@deepseek-ai/dsh-client-ui-theme):
 *   card  = --dsw-specific-menu #43454a73 over page #151517 -> #2a2b2e
 *   card upper bound = --dsw-alias-bg-layer-3               -> #353638
 *   rail  = --dsw-alias-bg-layer-1                          -> #232324
 *   knob  = --dsw-alias-label-primary                       -> #f9fafb
 * Inks are checked against the LIGHTEST dark surface, so clearing it means
 * clearing every surface the popover can be painted on.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

function lum(hex) {
  const h = hex.replace('#', '').slice(0, 6);
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function cr(a, b) {
  const [la, lb] = [lum(a), lum(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function mix(a, b, t) {
  /* NOTE: inputs keep their leading '#', so channels live at 1-based offsets —
   * the same convention as mixHex() in client.js. */
  const pa = [1, 3, 5].map(i => parseInt(a.replace('#', '').slice(i - 1, i + 1), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.replace('#', '').slice(i - 1, i + 1), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
}
/* self-test: the mix helper must be linear, or floor A is meaningless */
assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
assert.equal(mix('#232324', '#247aff', 0.22), '#233654');
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

// --- read the palettes out of the shipped source ----------------------------
const block = name => {
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
  assert.ok(m, `${name} not found`);
  const out = {};
  for (const mm of m[1].matchAll(/(\w+)\s*:\s*'(#[0-9a-fA-F]{6})'/g)) out[mm[1]] = mm[2];
  return out;
};
const FILL = block('EFFORT_FILL');
const INK = block('EFFORT_INK');
const FILL_DARK = block('EFFORT_FILL_DARK');
const INK_DARK = block('EFFORT_INK_DARK');

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const CHROMA = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const THEMES = [
  {
    name: 'light', fill: FILL, ink: INK,
    rail: '#e8e7e8',                    // measured from the original recording
    knob: '#ffffff',                    // --dsw-alias-bg-layer-2 (light) = #fff
    cards: ['#f8f8f8', '#fbfcfc'],      // documented card + real menu composite
    /* the light floor A is the DOCUMENTED one: fill vs the raw rail base */
    floorA: 'rail'
  },
  {
    name: 'dark', fill: FILL_DARK, ink: INK_DARK,
    rail: '#232324',                    // --dsw-alias-bg-layer-1 (dark)
    knob: '#f9fafb',                    // --dsw-alias-label-primary (dark)
    cards: ['#2a2b2e', '#2c2c2e', '#353638'],  // menu composite, token, layer-3
    /* dark checks the STRICTER floor: fill vs the tinted track it paints over */
    floorA: 'track'
  }
];

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};

/** Hue angle in degrees (0..360) — the axis the ramp is actually ordered by. */
for (const T of THEMES) {
  const tag = `[${T.name}]`;

  check(`${tag} palette covers the whole Codex ladder`, () => {
    assert.deepEqual(Object.keys(T.fill).sort(), [...LEVELS].sort());
    assert.deepEqual(Object.keys(T.ink).sort(), [...LEVELS].sort());
  });

  check(`${tag} every fill is visible against the unfilled rail (>= 2.5)`, () => {
    for (const k of LEVELS) {
      const target = T.floorA === 'track' ? mix(T.rail, T.fill[k], 0.22) : T.rail;
      const v = cr(T.fill[k], target);
      assert.ok(v >= 2.5, `${k} fill ${T.fill[k]} vs ${target} = ${v.toFixed(2)} (< 2.5)`);
    }
  });

  check(`${tag} the knob stays readable on every fill (>= 2.2)`, () => {
    for (const k of LEVELS) {
      const v = cr(T.knob, T.fill[k]);
      assert.ok(v >= 2.2, `${k} knob ${T.knob} vs ${T.fill[k]} = ${v.toFixed(2)} (< 2.2)`);
    }
  });

  check(`${tag} every heading ink passes AA body text (>= 4.5) on EVERY surface`, () => {
    for (const k of LEVELS) {
      for (const card of T.cards) {
        const v = cr(T.ink[k], card);
        assert.ok(v >= 4.5, `${k} ink ${T.ink[k]} vs ${card} = ${v.toFixed(2)} (< 4.5)`);
      }
    }
  });

  check(`${tag} ink stays as dark/light as its own fill (level identity)`, () => {
    for (const k of CHROMA) {
      const fi = lum(T.fill[k]), ii = lum(T.ink[k]);
      const gap = Math.abs(fi - ii);
      assert.ok(gap <= 0.35,
        `${k} fill Lw ${fi.toFixed(2)} vs ink Lw ${ii.toFixed(2)} drift too far apart (${gap.toFixed(2)})`);
    }
  });

  check(`${tag} off is neutral, not a washed-out blue`, () => {
    const h = T.fill.off.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, `off ${T.fill.off} is not neutral`);
  });

  check(`${tag} hue advances monotonically blue -> violet (the real ordering axis)`, () => {
    const hues = CHROMA.map(k => hue(T.fill[k]));
    for (let i = 1; i < hues.length; i++) {
      assert.ok(
        hues[i] >= hues[i - 1] - 1,
        `${CHROMA[i - 1]} hue ${hues[i - 1].toFixed(1)}deg should not go backwards to ${CHROMA[i]} ${hues[i].toFixed(1)}deg`
      );
    }
    assert.ok(hues[hues.length - 1] - hues[0] > 30, 'the ramp must span a visible hue range');
  });

  check(`${tag} every fill stays chromatic enough to read as colour`, () => {
    for (const k of CHROMA) {
      /* chroma = max-min in 8-bit space, the perceptual spread between the
       * most and least intense channel. A lightness-relative ratio (like
       * HSV saturation) wrongly flags bright dark-theme fills as "grey" even
       * at full HSL saturation, so the raw spread is what is asserted. */
      const h = T.fill[k].replace('#', '');
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      assert.ok(spread >= 40,
        `${k} ${T.fill[k]} channel spread ${spread} < 40 (reads as grey)`);
    }
  });

  check(`${tag} max is the most violet end of the ramp`, () => {
    const h = T.fill.max.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    assert.ok(b > r && r > g, `max ${T.fill.max} should be violet (b > r > g)`);
  });

  check(`${tag} every level has a DISTINCT fill (no accidental duplicates)`, () => {
    const seen = new Map();
    for (const k of LEVELS) {
      assert.ok(!seen.has(T.fill[k]), `${k} duplicates ${seen.get(T.fill[k])} (${T.fill[k]})`);
      seen.set(T.fill[k], k);
    }
  });
}

check('[both] the two palettes actually DIFFER per theme (dark is not a copy)', () => {
  for (const k of LEVELS) {
    assert.notEqual(FILL[k], FILL_DARK[k], `fill ${k} is identical in both themes`);
    assert.notEqual(INK[k], INK_DARK[k], `ink ${k} is identical in both themes`);
  }
});

/* The bug this file now guards: in dark mode the ink must be LIGHTER than the
 * card, not darker. Every dark ink clears the lightest dark surface, which is
 * exactly what the shipped v1.0.0 palette failed (#4a3fc0 vs #2c2c2e = 1.83). */
check('[dark] ink is lighter than the darkest card it sits on (the v1.0.0 bug)', () => {
  for (const k of LEVELS) {
    assert.ok(lum(INK_DARK[k]) > lum('#2c2c2e'),
      `${k} dark ink ${INK_DARK[k]} is not lighter than the card`);
  }
});

check('[both] the fill/track mixing helper is present and theme-aware', () => {
  assert.match(src, /function mixHex\(a, b, t\)/);
  assert.match(src, /function trackFor\(fill, dark\)/);
  assert.match(src, /trackFor\(fillFor\(displayed, dark\), dark\)/);
});

check('[both] the dark detection uses the shipped signal, not prefers-color-scheme', () => {
  assert.match(src, /hasAttribute\('data-ds-dark-theme'\)/,
    'must read the body attribute the shipped theme toggles');
  /* the media query is banned as a RUNTIME signal: it reports the OS scheme,
   * which disagrees with the palette when the user picks a fixed preference.
   * The one occurrence in client.js is the comment explaining exactly that. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /prefers-color-scheme/,
    'prefers-color-scheme disagrees with the palette when the preference is explicit');
});

let failed = 0;
for (const [s, n] of results) {
  if (s === 'ok') console.log(`  ok   ${n}`);
  else { failed++; console.log(`  FAIL ${n}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
