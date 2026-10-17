/**
 * Encoding guard.
 *
 * A PowerShell `Set-Content` once re-encoded the README with the system ANSI
 * codepage, turning it into mojibake with 559 unrecoverable characters. This
 * test fails loudly if any shipped text file stops being clean UTF-8, so that
 * class of damage can never land silently again.
 *
 * Checks every text file in the package:
 *   - decodes as strict UTF-8 (no replacement characters)
 *   - contains no common GBK-mojibake sequences
 *   - is not BOM-prefixed (the host JSON.parses package.json directly, and a
 *     BOM would make the whole plugin get discarded)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const TEXT_EXT = new Set(['.md', '.json', '.yml', '.yaml', '.js', '.mjs', '.svg', '.txt']);
/* Sequences that only appear when UTF-8 Chinese was decoded as GBK. */
const MOJIBAKE = ['锛', '鐨', '涓', '鏄', '锟', '鍜', '鐭', '骞', '鎺', '妯'];

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    // this guard file necessarily contains the mojibake list itself, so it is
    // the one file that must be exempt from its own scan
    else if (TEXT_EXT.has(extname(name)) && name !== 'encoding.mjs') out.push(p);
  }
  return out;
}

const files = walk(ROOT);
check('found text files to guard', () => {
  if (files.length < 5) throw new Error(`only ${files.length} files found`);
});

for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  check(`${rel} is clean UTF-8`, () => {
    const buf = readFileSync(f);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      throw new Error('does not decode as strict UTF-8 (likely re-encoded)');
    }
    if (text.includes('\uFFFD')) throw new Error('contains U+FFFD replacement characters');
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      throw new Error('starts with a UTF-8 BOM (breaks the host JSON.parse)');
    }
    const hit = MOJIBAKE.find(m => text.includes(m));
    if (hit) throw new Error(`contains GBK mojibake (e.g. "${hit}")`);
  });
}

check('README still has its real headings (not silently truncated)', () => {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const h of ['# dsh-codex-model-effort-selector', '## 功能', '## 安装', '## 开发']) {
    if (!md.includes(h)) throw new Error(`missing heading: ${h}`);
  }
  if (md.length < 4000) throw new Error(`README suspiciously short (${md.length} bytes)`);
});

let failed = 0;
for (const [s, n] of results) {
  if (s === 'ok') console.log(`  ok   ${n}`);
  else { failed++; console.log(`  FAIL ${n}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
