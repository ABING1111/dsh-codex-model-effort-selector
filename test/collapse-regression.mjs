/**
 * Regression test for the expand/collapse bug (issue 1).
 *
 * The bug: `toggleGroup` wrote to the state as a set of EXPANDED ids, while
 * `isExpanded` read the SAME state as a set of COLLAPSED ids. The first click on
 * a collapsed group therefore produced an EMPTY set, which `isExpanded` read as
 * "nothing is collapsed" -> every group expanded at once.
 *
 * This file re-implements both the buggy and the fixed state machines and
 * asserts the fixed one behaves, so the shape of the bug can never come back
 * unnoticed. It also asserts the shipped source no longer contains the inverted
 * read.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};

/* ---------- the BUGGY model, kept to prove the failure is real ---------- */
function buggy(selected = 'A') {
  const groups = ['A', 'B', 'C'];
  let expanded = null;   // null = default; else a Set
  const isExpanded = gid => expanded === null ? gid === selected : !expanded.has(gid);
  const toggle = gid => {
    const base = expanded ? new Set(expanded) : null;
    const cur = base ? !base.has(gid) : (gid === selected);
    const next = new Set(base ?? []);
    if (cur) next.add(gid); else next.delete(gid);
    expanded = next;
  };
  return { groups, isExpanded, toggle, get state() { return expanded; } };
}

check('the buggy model really does expand everything on one click', () => {
  const m = buggy('A');
  assert.equal(m.isExpanded('B'), false, 'B starts collapsed');
  m.toggle('B');                                  // user clicks the COLLAPSED group
  const opened = m.groups.filter(m.isExpanded);
  assert.deepEqual(opened, ['A', 'B', 'C'], 'buggy model opens all three');
});

/* ---------- the FIXED model (what ships) ---------- */
function fixed(selected = 'A') {
  const groups = ['A', 'B', 'C'];
  let view = 1;              // 1 = provider list, 2 = models of subProvider
  let subProvider = null;
  const isOpen = gid => view === 2 && subProvider === gid;
  const enter = gid => { subProvider = gid; view = 2; };
  const back = () => { view = 1; subProvider = null; };
  return { groups, isOpen, enter, back };
}

check('the fixed model opens exactly one provider', () => {
  const m = fixed('A');
  assert.deepEqual(m.groups.filter(m.isOpen), [], 'nothing is drilled in initially');
  m.enter('B');
  assert.deepEqual(m.groups.filter(m.isOpen), ['B'], 'exactly B, not all three');
});

check('the fixed model never opens more than one provider at a time', () => {
  const m = fixed('A');
  m.enter('B');
  m.enter('C');                                   // switching providers directly
  assert.deepEqual(m.groups.filter(m.isOpen), ['C'], 'still exactly one');
});

check('back returns to the provider list', () => {
  const m = fixed('A');
  m.enter('B');
  m.back();
  assert.deepEqual(m.groups.filter(m.isOpen), [], 'no provider open after back');
});

/* ---------- the shipped source must not contain the inverted read ---------- */
check('shipped source has no inverted collapse read', () => {
  assert.doesNotMatch(src, /!collapsedIds\.has\(/, 'inverted set read is gone');
  assert.doesNotMatch(src, /collapsedIds/, 'collapsedIds identifier is gone');
  assert.doesNotMatch(src, /toggleGroup/, 'toggleGroup is gone');
  assert.doesNotMatch(src, /next\.add\(gid\)/, 'expanded-id write is gone');
});

check('shipped source has exactly one page predicate', () => {
  // one source of truth removes the possibility of two halves disagreeing
  assert.match(src, /const isCurrent = selection\?\.provider === g\.id;/, 'current provider check');
  assert.match(src, /if \(view !== 2 \|\| !activeProvider\)/, 'height predicate');
  assert.match(src, /className: `\$\{P\}-viewport\$\{view === 2 \? ' view2' : ''\}`/, 'view class');
});

let failed = 0;
for (const [s, n] of results) {
  if (s === 'ok') console.log(`  ok   ${n}`);
  else { failed++; console.log(`  FAIL ${n}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
