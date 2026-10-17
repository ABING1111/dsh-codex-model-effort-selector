/**
 * Offline verification harness for the plugin's client bundle.
 *
 * Loads `client.js` into a stub `window.__ModuleLoader__`, supplies minimal
 * React / DOM shims, and exercises the pure logic paths:
 *   - effort ordering + Codex labels
 *   - peak (Ultra) detection keyed on id, not position
 *   - rail pointer -> index math (the shared inset geometry)
 *   - model search (case-insensitive ordered subsequence)
 *   - slot registration shape against the documented host contract
 *
 * The React render path is stubbed (no real React available offline); geometry
 * and colour are verified separately by rendering the HTML prototype.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

/* ---------------------------------------------------------------------------
 * React stub.
 *
 * No React ships with this workspace, and the host supplies it through its
 * module table at runtime. The stub is enough to *load* the bundle and capture
 * its registration; the render path itself is verified in the browser against
 * the recorded original (see docs/codex-reasoning-slider-spec.md).
 * ------------------------------------------------------------------------- */
const reactStub = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: v => ({ current: v }),
  useMemo: fn => fn(),
  useSyncExternalStore: (sub, get) => get(),
  Fragment: 'Fragment'
};
const requireStub = spec => (spec === 'react' ? reactStub : {});


let registered = null;
const loaded = {};

globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      assert.equal(def.id, 'dsh-codex-model-effort-selector', 'bundle id');
      loaded.mod = def.factory(requireStub);
    }
  },
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
};

let n = 0;
const results = [];
function check(name, fn) {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
}

// --- execute the bundle so it registers itself -----------------------------
check('bundle loads and exports a plugin', () => {
  // the bundle is a plain script that calls window.__ModuleLoader__.load()
  new Function('window', 'document', 'performance', code)(
    globalThis.window, globalThis.document,
    { now: () => 0 }
  );
  assert.ok(loaded.mod, 'factory ran');
  assert.equal(typeof loaded.mod.apply, 'function', 'apply()');
  assert.deepEqual(loaded.mod.inject, ['slots', 'modelDirectories', 'sessions', 'locale']);
});

// --- capture what apply() registers ---------------------------------------
const dictionary = {};
const slotCalls = [];
const ctx = {
  effect: fn => { fn(); },
  locale: {
    register: (ns, dict) => { dictionary[ns] = dict; },
    bind: ns => key => (dictionary[ns] && dictionary[ns].zh && dictionary[ns].zh[key]) ?? key
  },
  slots: {
    inject: (name, cb) => { slotCalls.push(name); cb(); },
    register: (def, Comp) => { registered = { def, Comp }; return () => {}; }
  },
  modelDirectories: {
    directoryFor: () => ({
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: null, pending: null, groups: [], status: 'idle' })
      },
      load: () => Promise.resolve(),
      select: () => Promise.resolve({ ok: true })
    })
  },
  sessions: { subagentAddress: () => undefined }
};

check('apply() registers the composer model seat', () => {
  loaded.mod.apply(ctx);
  assert.deepEqual(slotCalls, ['conversation.input.model']);
  assert.ok(registered, 'slot registered');
  assert.equal(registered.def.name, 'conversation.input.model');
  assert.equal(registered.def.locale, 'dsh-codex-model-effort-selector');
  assert.equal(typeof registered.def.inject, 'function');
  assert.equal(typeof registered.Comp, 'function');
});

check('shadows the shipped seat instead of colliding with it', () => {
  // `conversation.input.model` is `kind: 'single'` and the shipped
  // ModelSelect already holds it at priority 0. A single slot allows only one
  // entry per priority and register() THROWS on a duplicate, so priority 0
  // would abort the whole plugin load. Shadowing needs a strictly lower value.
  const p = registered.def.priority;
  assert.equal(typeof p, 'number', 'priority must be an explicit number');
  assert.ok(p < 0, `priority must be < 0 to win the cell, got ${p}`);
});

check('no duplicate key collides with the shipped registration', () => {
  // A single slot's cell is the whole slot, so the ONLY collision risk is the
  // priority value; assert we did not also smuggle in a key/id/order.
  assert.equal(registered.def.key, undefined, 'single slot takes no key');
  assert.equal(registered.def.id, undefined, 'single slot takes no id');
});

check('owner-supplied props are not re-declared by inject()', () => {
  // `locked` is passed by the slot owner (renderSlot(..., { locked })),
  // so the business share must not shadow it with a constant.
  const api = registered.def.inject('session-1');
  assert.equal('locked' in api, false, 'locked must come from the owner, not inject');
  assert.deepEqual(Object.keys(api).sort(), ['available', 'directory', 'load', 'select', 'sessionId']);
  // the session id rides the injected face so per-session preferences can be
  // keyed by it (the Fast toggle). It must be the id the host handed us.
  assert.equal(api.sessionId, 'session-1', 'inject() forwards the session id');
});

check('dictionaries have identical key sets (zh/en)', () => {
  const d = dictionary['dsh-codex-model-effort-selector'];
  assert.ok(d, 'dictionary registered');
  const zk = Object.keys(d.zh).sort();
  const ek = Object.keys(d.en).sort();
  assert.deepEqual(zk, ek, 'key sets must match');
  assert.ok(zk.length >= 20, `enough keys (${zk.length})`);
});

check('slot inject() returns the documented shape', () => {
  const api = registered.def.inject('session-1');
  assert.equal(api.available, true);
  assert.equal(typeof api.load, 'function');
  assert.equal(typeof api.select, 'function');
  assert.ok(api.directory, 'directory store present');
});

check('subagent sessions are reported unavailable', () => {
  ctx.sessions.subagentAddress = () => 'agent-7';
  const api = registered.def.inject('session-2');
  assert.equal(api.available, false, 'subagent must not select');
  ctx.sessions.subagentAddress = () => undefined;
});

// --- pure logic mirrored from the bundle ----------------------------------
// (kept in sync by asserting against the shipped source text)
const src = code;

check('peak ids are max/ultra (not "last stop")', () => {
  assert.match(src, /const PEAK_IDS = \['max', 'ultra'\];/);
  assert.match(src, /isPeakId = id => PEAK_IDS\.includes/);
  // the buggy positional form must be gone
  assert.doesNotMatch(src, /nextIdx === efforts\.length - 1 && nextIdx > 0/);
});

check('geometry constants match the measured spec', () => {
  // knob and fill both derive from ONE unitless --pos fraction, so a drag can
  // drive it directly and React's next render restores the snapped value
  assert.match(src, /width:calc\(\(100% - 30px\)\*var\(--\$\{P\}-pos,0\) \+ 15px\)/, 'fill formula');
  assert.match(src, /left:calc\(\(100% - 30px\)\*var\(--\$\{P\}-pos,0\)\)/, 'knob formula');
  assert.match(src, /top:65px;height:26px;border-radius:16px/, 'rail box');
  assert.match(src, /left:12px;right:12px;top:65px/, 'rail inset');
  assert.match(src, /width:30px;height:30px;border-radius:50%/, 'knob');
  assert.match(src, /top:11px;left:calc\(\(100% - 30px\)\*var\(--\$\{P\}-tick,0\) \+ 15px\);width:4px;height:4px/, 'dot');
  // the shared 15px / 30px inset pair must survive in the pointer math
  assert.match(src, /\(clientX - box\.left - 15\) \/ \(box\.width - 30\)/, 'inset math');
  assert.match(src, /15 \+ frac \* \(box\.width - 30\)/, 'knobX math');
  // no pixel-valued leftovers that React could fail to restore on release
  assert.doesNotMatch(src, /--\$\{P\}-knob-x/, 'knob-x pixel var must be gone');
  assert.doesNotMatch(src, /--\$\{P\}-w,/, 'fill width pixel var must be gone');
});

check('measured palette is present', () => {
  // the original recording's blue plus the violet Ultra ink are still here
  for (const c of ['#3a83f7', '#3b83f6', '#a779fe', '#7448ee', '#8b46ee']) {
    assert.ok(src.includes(c), `missing ${c}`);
  }
});

check('dark theme is wired to the shipped signal and swaps every palette', () => {
  // detection: the body attribute the shipped theme toggles, read reactively
  assert.match(src, /hasAttribute\('data-ds-dark-theme'\)/, 'dark detection reads the body attribute');
  assert.match(src, /useSyncExternalStore\(subscribeTheme, isDarkNow/, 'the flag is reactive');
  assert.match(src, /attributeFilter: \['data-ds-dark-theme'\]/, 'the observer filters to that one attribute');
  // palettes: both tables exist and every stamp site is theme-aware
  for (const table of ['EFFORT_FILL_DARK', 'EFFORT_INK_DARK',
    'FILL_FALLBACK_DARK', 'INK_FALLBACK_DARK', 'RAIL_BASE_DARK']) {
    assert.ok(src.includes(`const ${table}`), `missing ${table}`);
  }
  for (const site of ['fillFor(displayed, dark)', 'inkFor(displayed, dark)', 'inkFor(savedEffort, dark)']) {
    assert.ok(src.includes(site), `stamp site not theme-aware: ${site}`);
  }
  assert.match(src, /trackFor\(fillFor\(displayed, dark\), dark\)/, 'track is theme-aware');
  // the light track base stays the measured one
  assert.match(src, /RAIL_BASE_LIGHT = '#e8e7e8'/, 'light rail base is the measured value');
  // the dark chrome block exists and pins the surfaces that CSS owns
  assert.match(src, /body\[data-ds-dark-theme\] \.\$\{P\}-root\{/, 'dark chrome block present');
  assert.match(src, /--\$\{P\}-knob:#f9fafb/, 'dark knob is a bright puck');
  assert.match(src, /--\$\{P\}-dotPassed:#f9fafb/, 'dark passed ticks match the knob');
  // the bug's shape: no theme-blind stamping may come back
  assert.doesNotMatch(src, /fillFor\(displayed\)[,)]/, 'theme-blind fillFor must be gone');
  assert.doesNotMatch(src, /inkFor\((displayed|savedEffort)\)[,)]/, 'theme-blind inkFor must be gone');
  assert.doesNotMatch(src, /mixHex\('#e8e7e8'/, 'the track base must not be hardcoded at the call site');
});

check('REGRESSION: the v1.0.0 dark palette must never return', () => {
  // Every light ink is too dark for a dark card; 'high' was the reported case
  // (#4a3fc0 vs #2c2c2e = 1.83:1, near-invisible). Assert none of those hexes
  // appear inside the dark ink table.
  const darkBlock = src.match(/const EFFORT_INK_DARK = \{([\s\S]*?)\};/);
  assert.ok(darkBlock, 'EFFORT_INK_DARK not found');
  for (const bad of ['#707073', '#2b62bd', '#2f6fd0', '#3a55b8', '#4a3fc0', '#6a35c8', '#8b46ee']) {
    assert.ok(!darkBlock[1].includes(bad), `dark ink reuses the light-mode ${bad}`);
  }
  // and the dark knob must not be the token that vanishes against the track
  const css = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(css, 'CSS not found');
  assert.match(css[1], /--\$\{P\}-knob:#f9fafb/,
    'the dark knob must override bg-layer-2 (#2c2c2e), which the #232324 track swallows');
});

check('no host hooks or events are registered (fail-open)', () => {
  assert.doesNotMatch(src, /ctx\.on\(/, 'must not emit/subscribe events');
  assert.doesNotMatch(src, /ctx\.plugin\(/, 'must not install plugins');
  assert.doesNotMatch(src, /productAnalytics/, 'no analytics');
});

check('Cordis effect is used for disposal', () => {
  assert.match(src, /ctx\.effect\(\(\) => ctx\.locale\.register/, 'locale register inside effect');
});

check('rail pointer math uses the 15px inset', () => {
  assert.match(src, /\(clientX - box\.left - 15\) \/ \(box\.width - 30\)/, 'nearest() inset math');
});

check('drag is continuous, not snapped while the pointer is down', () => {
  // paintLive must write the raw fraction, and every pointer sample must go
  // through ONE applier so the press and the moves can never disagree
  assert.match(src, /function paintLive\(frac\)[\s\S]*?setProperty\(`--\$\{P\}-pos`, String\(frac\)\)/, 'paintLive writes fraction');
  assert.match(src, /function applyPointer\(clientX\) \{[\s\S]*?const frac = fractionAt\(clientX\)[\s\S]*?paintLive\(frac\)/, 'applyPointer tracks the pointer');
  assert.match(src, /applyPointer\(e\.clientX\); \}/, 'the move listener feeds raw coordinates');
  // snapping belongs on release only
  assert.match(src, /function finish\(event\)[\s\S]*?nearestIndex\(event\.clientX\)/, 'finish snaps');
});

check('an in-flight commit never blocks grabbing the rail', () => {
  // pointerDown must not test busyRef — that was the "cannot grab it" symptom
  const pd = src.match(/function pointerDown\(event\) \{([\s\S]*?)\n      \}/);
  assert.ok(pd, 'pointerDown found');
  assert.doesNotMatch(pd[1], /busyRef\.current/, 'pointerDown must not gate on busyRef');
});

check('in-flight commits coalesce instead of being dropped', () => {
  assert.match(src, /pendingRef\.current = next;/, 'newest intent remembered');
  assert.match(src, /if \(busyRef\.current\) return;/, 'only the first runs the loop');
  assert.match(src, /while \(pendingRef\.current\)/, 'queued intent is drained');
});

check('model search is a case-insensitive ordered subsequence', () => {
  assert.match(src, /name\.includes\(q\)/, 'substring pass');
  assert.match(src, /for \(const ch of name\) if \(ch === q\[i\]\) i\+\+;/, 'subsequence pass');
  assert.match(src, /query\.trim\(\)\.toLowerCase\(\)/, 'normalisation');
});

/* ── two-level drill-down (replaces the buggy collapsible-group list) ────── */

check('the model pane is a two-level drill-down, not collapsible groups', () => {
  // page state exists and is 1 | 2
  assert.match(src, /const \[view, setView\] = useState\(1\)/, 'view state');
  assert.match(src, /const \[subProvider, setSubProvider\] = useState\(null\)/, 'sub-provider state');
  // navigation helpers
  assert.match(src, /function enterProvider\(gid\)[\s\S]*?setView\(2\)/, 'enterProvider drills in');
  assert.match(src, /function goBack\(\)[\s\S]*?setView\(1\)/, 'goBack returns');
  // both pages rendered
  assert.match(src, /\$\{P\}-page slot1/, 'page 1 rendered');
  assert.match(src, /\$\{P\}-page slot2/, 'page 2 rendered');
  // the contradictory open/closed set model must be gone entirely
  assert.doesNotMatch(src, /collapsedIds/, 'collapsedIds removed');
  assert.doesNotMatch(src, /toggleGroup/, 'toggleGroup removed');
  assert.doesNotMatch(src, /isExpanded/, 'isExpanded removed');
});

check('REGRESSION: no contradictory expand/collapse state remains', () => {
  // The original bug: `toggleGroup` treated the state as a set of EXPANDED ids
  // while `isExpanded` read it as a set of COLLAPSED ids, so the first click
  // produced an empty set => "nothing collapsed" => every group opened at once.
  // A one-meaning-only design (a page index) makes that impossible.
  assert.doesNotMatch(src, /!collapsedIds\.has/, 'no inverted set read');
  assert.doesNotMatch(src, /next\.add\(gid\)/, 'no expanded-id set write');
  // exactly one source of truth for which page shows
  assert.match(src, /if \(view !== 2 \|\| !activeProvider\)/, 'single page predicate');
});

check('page 1 rows show the provider name + chevron (no gray model text)', () => {
  // the gray "currently selected model" column was removed on request: page 1
  // is name + dot + chevron, nothing else.
  assert.doesNotMatch(src, /\$\{P\}-rowCur/, 'current-model column removed');
  assert.doesNotMatch(src, /\$\{P\}-rowCur\{/, 'current-model style removed');
  assert.match(src, /\$\{P\}-rowChev/, 'chevron');
  // and the name must absorb the free space so the dot/chevron stay right
  assert.match(src, /\$\{P\}-rowName\{flex:1 1 auto;min-width:0;overflow:hidden/, 'name fills the row');
  assert.match(src, /aria-expanded': view === 2 && subProvider === g\.id/, 'expanded state');
});

check('page 2 has a back button, a search box and a list', () => {
  assert.match(src, /\$\{P\}-back/, 'back button');
  assert.match(src, /\$\{P\}-search/, 'search box');
  assert.match(src, /\$\{P\}-list/, 'scrollable list');
});

check('Escape backs out one layer at a time', () => {
  assert.match(src, /if \(latest\.current\.view === 2\) \{ goBack\(\); \}/, 'page 2 -> page 1');
  assert.match(src, /else \{ setPane\('effort'\); setQuery\(''\); \}/, 'page 1 -> effort');
});

check('switching model lands on the MIDDLE level (reference rule)', () => {
  assert.match(src, /const mid = levels\.length \? levels\[Math\.floor\(levels\.length \/ 2\)\]\.id : undefined/,
    'floor(n/2) rule');
  // a model with no levels must omit the key, not send null
  assert.match(src, /\(id === undefined \? \{\} : \{ reasoningEffort: id \}\)/, 'absent, never null');
});

check('the drill-down state resets on close', () => {
  const closeFn = src.match(/function close\(\) \{([\s\S]*?)\n      \}/);
  assert.ok(closeFn, 'close found');
  assert.match(closeFn[1], /setView\(1\)/, 'view reset');
  assert.match(closeFn[1], /setSubProvider\(null\)/, 'sub-provider reset');
});

check('height uses real measured row heights (no clipping)', () => {
  // the reference learned this the hard way: a stale row height clips the last
  // row of page 1, and page 1 has no scroll container to recover
  assert.match(src, /const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;/, 'row constants');
  assert.match(src, /const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, SEC_H = 30, PAD = 20;/, 'page-2 constants');
  // CSS must agree with the constants
  assert.match(src, /\$\{P\}-row\{[^}]*padding:10px;border-radius:10px/, 'row padding 10 (=> 41 high)');
  assert.match(src, /\$\{P\}-model\{[^}]*padding:9px 10px;border-radius:9px/, 'model padding 9 (=> 39 high)');
  assert.match(src, /\$\{P\}-list\{[^}]*max-height:252px/, 'list cap matches');
});

/* ── the three latest reported issues ───────────────────────────────────── */

check('ISSUE 1: the active provider is marked with a blue dot', () => {
  assert.match(src, /\$\{P\}-rowDot\{[^}]*border-radius:50%;background:var\(--\$\{P\}-accent/, 'dot style');
  assert.match(src, /className: `\$\{P\}-rowDot`, hidden: !isCurrent/, 'dot only on the current provider');
  // keyed off the SELECTION, not off which provider is drilled into
  assert.match(src, /const isCurrent = selection\?\.provider === g\.id;/, 'keyed on selection');
  // the dot sits at the RIGHT end: it is rendered AFTER the name (the name
  // takes flex:1, so the dot + chevron get pushed to the right edge)
  const row = src.match(/const providerNodes = groups\.map\(g => \{[\s\S]*?\n      \}\);/);
  assert.ok(row, 'provider row builder found');
  const nameAt = row[0].indexOf('${P}-rowName');
  const dotAt = row[0].indexOf('${P}-rowDot');
  const chevAt = row[0].indexOf('${P}-rowChev');
  assert.ok(nameAt > -1 && dotAt > -1 && chevAt > -1, 'name, dot and chevron all rendered');
  assert.ok(nameAt < dotAt, 'dot comes AFTER the name (right side)');
  assert.ok(dotAt < chevAt, 'dot comes BEFORE the chevron');
});

check('ISSUE 2: every page list is its own scroller', () => {
  // the pane needs a DEFINITE height, otherwise height:100% resolves to auto
  // and the flex chain cannot hand leftover space to the scrollers
  assert.match(src, /\$\{P\}-models\{top:0;height:100%/, 'pane pinned top:0 for a definite height');
  assert.match(src, /\$\{P\}-viewport\{[^}]*min-height:0/, 'viewport min-height:0');
  assert.match(src, /\$\{P\}-page\{[^}]*height:100%;display:flex;flex-direction:column;overflow:hidden/, 'page is a flex column');
  // page 1 gets its OWN scroll container (the reported bug: it had none)
  assert.match(src, /\$\{P\}-rows\{flex:1 1 auto;min-height:0;overflow-y:auto/, 'page-1 scroller');
  assert.match(src, /h\('div', \{ className: `\$\{P\}-rows` \}, \.\.\.providerNodes, \.\.\.noticeNodes\)/, 'page 1 wraps rows in the scroller');
  // and the height is capped to the room above the trigger
  assert.match(src, /const roomAbove = typeof window === 'undefined'/, 'room-above computation');
  assert.match(src, /const cappedHeight = Math\.min\(menuHeight, roomAbove\)/, 'height is capped');
  assert.match(src, /\$\{pane === 'models' \? cappedHeight : 104\}px/, 'capped height applied');
});

check('ISSUE 3: the knob always settles on a stop on release', () => {
  // snapLive exists and writes the snapped fraction directly
  assert.match(src, /function snapLive\(i\)[\s\S]*?setProperty\(`--\$\{P\}-pos`, String\(stopFraction\(i\)\)\)/, 'snapLive writes a stop');
  // release path snaps BEFORE committing
  const fin = src.match(/function finish\(event\) \{([\s\S]*?)\n      \}/);
  assert.ok(fin, 'finish found');
  assert.match(fin[1], /snapLive\(i\)/, 'finish snaps the knob');
  /* A release with NO coordinates (the window-level safety net, a synthesised
   * pointerup, a lost capture) must resolve to the CURRENT stop. The old
   * `nearestIndex(event ? event.clientX : NaN)` wrote `--pos: NaN`, which makes
   * the knob's `left:calc(...)` invalid and hurls the knob across the track. */
  assert.match(fin[1], /Number\.isFinite\(event\.clientX\)/, 'finish guards a coordinate-less release');
  assert.match(fin[1], /known \? nearestIndex\(event\.clientX\) : index/, 'falls back to the current stop');
  // strip comments: the fix's own explanation quotes the NaN form it replaces
  const finCode = fin[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(finCode, /NaN/, 'no NaN may reach snapLive');
  // cancel rolls back onto the committed stop, not the raw position
  const cancel = src.match(/function cancelDrag\(\) \{([\s\S]*?)\n      \}/);
  assert.ok(cancel, 'cancelDrag found');
  assert.match(cancel[1], /snapLive\(index\)/, 'cancel rolls back to a stop');
  // keyboard moves snap too
  const key = src.match(/function keyDown\(event\) \{([\s\S]*?)\n      \}/);
  assert.ok(key, 'keyDown found');
  assert.match(key[1], /snapLive\(i\)/, 'keyboard snaps');
  // a helper defines what a stop is
  assert.match(src, /function stopFraction\(i\)/, 'stop fraction helper');
});

check('provider load failures are surfaced, not swallowed', () => {
  assert.match(src, /\$\{P\}-failure/, 'failure row class');
  assert.match(src, /state\.failures/, 'reads failures from the directory snapshot');
});

check('sparkles are deterministic (no Math.random in code)', () => {
  // strip comments so a comment mentioning Math.random cannot mask a real call
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(noComments, /Math\.random/, 'must be deterministic');
  assert.match(src, /function hash01\(n\)/);
});

check('reduced-motion slows rather than freezes particles', () => {
  assert.match(src, /prefers-reduced-motion:reduce/, 'media query present');
  assert.match(src, /animation-duration:calc\(var\(--dur,3s\) \* 2\.6\)/, 'x2.6');
});

check('accessible roles are declared', () => {
  assert.match(src, /role: 'slider'/, 'slider role');
  assert.match(src, /'aria-valuetext': currentLabel/, 'valuetext');
  assert.match(src, /role: 'menuitemradio'/, 'model rows');
  assert.match(src, /'aria-checked': selected/, 'checked state');
});

/* ── the Fast tooltip: why it never appeared, and the fix ────────────────── */

check('FIX: the Fast tooltip lives OUTSIDE the popover', () => {
  // Root cause: the popover paints the shipped menu material, and a non-none
  // backdrop-filter makes an element the CONTAINING BLOCK for fixed descendants.
  // A position:fixed tooltip inside it was therefore laid out against the
  // popover box and clipped away by overflow:hidden — hover set opacity:1 but
  // nothing was ever painted.
  assert.match(src, /\.\$\{P\}-popover\{[\s\S]*?backdrop-filter:var\(--dsw-menu-backdrop-filter\)/,
    'the popover still paints the menu material (the cause)');
  assert.match(src, /\.\$\{P\}-popover\{[\s\S]*?overflow:hidden/, 'and it still clips (the other half of the cause)');
  // the old descendant rule can no longer work, so it must be gone
  assert.doesNotMatch(src, /\.\$\{P\}-fast:hover \[role=tooltip\]/, 'descendant hover rule removed');
  // the tooltip node must be rendered AFTER the popover section, i.e. outside it
  const sectionAt = src.indexOf("h('section', {");
  const tipAt = src.indexOf("role: 'tooltip'");
  assert.ok(sectionAt > -1, 'popover section exists');
  assert.ok(tipAt > -1, 'tooltip node exists');
  assert.ok(tipAt > sectionAt, 'the tooltip renders after (outside) the popover');
  assert.equal(src.split("role: 'tooltip'").length - 1, 1, 'exactly one tooltip node');
});

check('FIX: tooltip visibility is state-driven, and it is placed with real metrics', () => {
  assert.match(src, /const \[tipOn, setTipOn\] = useState\(false\)/, 'hover/focus state');
  assert.match(src, /className: `\$\{P\}-tip\$\{tipShown \? ' show' : ''\}`/, '`.show` drives it');
  assert.match(src, /\.\$\{P\}-tip\.show\{opacity:1;visibility:visible/, 'the CSS exists');
  // positioning must happen AFTER layout: on the first hover the un-laid-out
  // layer reported 0x0 and was placed with placeholder numbers
  assert.match(src, /if \(!tipShown\) return;\s*positionTip\(\);/, 'layout effect positions it');
  assert.match(src, /const th = tip\.offsetHeight \|\| 44;/, 'height is measured');
  // and it must never outlive the state that anchors it
  assert.match(src, /if \(!open\) setTipOn\(false\)/, 'closes with the popover');
  assert.match(src, /if \(pane !== 'effort'\) setTipOn\(false\)/, 'closes with the pane');
});

check('the tooltip keeps the reference card shape and the disclosure stays reachable', () => {
  // two visible lines (title + quota note), like the reference tooltip
  assert.match(src, /h\('span', \{ className: `\$\{P\}-tipTitle` \}, t\('fast'\)\)/, 'title line');
  assert.match(src, /h\('span', null, t\('usage'\)\)/, 'secondary line');
  // the "visual only" note is not deleted, only demoted to assistive tech
  assert.match(src, /h\('span', \{ className: `\$\{P\}-sr` \}, t\('visual'\)\)/, 'sr-only disclosure');
  assert.match(src, /'aria-describedby': 'cmes-fast-tip'/, 'button points at the tooltip');
});

/* ── "reset to default" must work beyond the DeepSeek group ─────────────── */

check('FIX: reset works for providers that declare no default effort', () => {
  // `defaultEffort` is OPTIONAL in the host catalog: the session controller
  // only emits the key when the provider resolves one
  // (`...(resolved.reasoning.defaultEffort === undefined ? {} : …)`), and the
  // Trae adapter forwards it only when the UPSTREAM model advertises
  // `default_reasoning_effort`. So `reasoning.efforts` can exist without a
  // default. The reset button used to call chooseEffort(defaultEffort)
  // unconditionally, and chooseEffort rejects an id that is not a declared
  // stop — a silent no-op for exactly those groups.
  assert.match(src, /function defaultStopId\(\)/, 'one definition of "default"');
  assert.match(src, /const declared = model\?\.reasoning\?\.defaultEffort;/, 'reads the declared default');
  assert.match(src, /if \(declared !== undefined && efforts\.some\(e => e\.id === declared\)\) return declared;/,
    'the declared default wins when it is a real stop');
  assert.match(src, /return efforts\[Math\.floor\(efforts\.length \/ 2\)\]\.id;/,
    'otherwise the middle stop — the same rule chooseModel uses');
  assert.match(src, /function resetToDefault\(\)/, 'reset helper');
  assert.match(src, /onClick: resetToDefault/, 'the button uses the helper');
  // the inert unconditional call must be gone
  assert.doesNotMatch(src, /chooseEffort\(model\?\.reasoning\?\.defaultEffort\)/, 'no inert reset call');
  // and the button must be disabled only when there is nothing to reset to
  assert.match(src, /disabled: busy \|\| efforts\.length === 0/, 'honest disabled state');
});

/* ── a long model name must not swallow the level label ─────────────────── */

check('FIX: a long model name truncates instead of hiding the level', () => {
  // The name and the level used to share ONE truncating box, so a long name —
  // and Fast on, which spends another ~21px on the ⚡ — pushed the level past
  // the ellipsis and the level vanished from the collapsed seat.
  assert.match(src, /\.\$\{P\}-caption\{flex:0 1 auto;/, 'the caption is the shrinking item');
  assert.match(src, /\.\$\{P\}-triggerEffort\{flex:none;/, 'the level never shrinks');
  // structurally: the level span is a SIBLING of the caption, not a child of it
  assert.match(src, /: modelName\),\s*triggerLabel\s*\? h\('span', \{ className: `\$\{P\}-triggerEffort` \}, triggerLabel\)/,
    'the level is rendered outside the truncating box');
  // the old in-caption form (with its leading space) must be gone
  assert.doesNotMatch(src, /` \$\{triggerLabel\}`/, 'no level text inside the caption');
});

/* ── the Fast toggle must survive a conversation switch ─────────────────── */

check('NEW: the Fast toggle is remembered per conversation', () => {
  // The seat is session-scoped, so switching conversations REMOUNTS the
  // component. Component-only state therefore forgot the toggle: "选 Fast 后
  // 切走再切回来又变回默认". It is stored per session and restored on mount.
  assert.match(src, /const FAST_STORE_PREFIX = 'dsh\.codex-effort-selector\.fast\.v1\.';/,
    'namespaced, versioned storage key (the host uses dsh.<area>.v1.<sessionId>)');
  assert.match(src, /const \[fast, setFastState\] = useState\(\(\) => readFast\(sessionId\)\);/, 'restored on mount');
  assert.match(src, /function readFast\(sessionId\)[\s\S]*?localStorage\.getItem\(FAST_STORE_PREFIX \+ sessionId\)/, 'read is per session');
  assert.match(src, /function writeFast\(sessionId, on\)[\s\S]*?localStorage\.setItem\(FAST_STORE_PREFIX \+ sessionId/, 'write is per session');
  // an in-memory mirror makes a switch inside one app run independent of storage
  assert.match(src, /const fastMemory = new Map\(\);/, 'in-memory mirror');
  assert.match(src, /if \(fastMemory\.has\(sessionId\)\) return fastMemory\.get\(sessionId\);/, 'mirror wins on read');
  assert.match(src, /fastMemory\.set\(sessionId, on\);/, 'mirror written');
  // every change is written through — including the reset button's setFast(false)
  assert.match(src, /setFastState\(value\);\s*writeFast\(sessionId, value\);/, 'persisted on change');
  assert.match(src, /typeof next === 'function' \? next\(fastRef\.current\) : next/, 'wraps the setState contract');
  // if the host reuses the instance instead of remounting, adopt the new session
  assert.match(src, /if \(fastSessionRef\.current === sessionId\) return;/, 'session switch re-reads');
  // fail-open: a locked-down storage must never break the composer
  assert.match(src, /catch \{ return false; \}/, 'read degrades to off');
  assert.match(src, /catch \{ \/\* storage disabled/, 'write swallows failures');
  assert.match(src, /if \(typeof localStorage === 'undefined'\) return false;/, 'guards for storage absence');
});

/* ── the far-right arrival bloom ────────────────────────────────────────── */

check('NEW: arriving at the far-right stop blooms particles', () => {
  assert.match(src, /const BLOOM_COUNT = 18;/, 'mote count');
  assert.match(src, /function buildBloom\(count\)/, 'deterministic builder');
  assert.match(src, /const arrived = index === efforts\.length - 1 && seenIndexRef\.current !== index;/,
    'fires on the ARRIVAL transition only');
  assert.match(src, /if \(arrived\) setBloom\(n => n \+ 1\);/, 'bumps the burst key');
  assert.match(src, /if \(seenIndexRef\.current === null\) \{ seenIndexRef\.current = index; return; \}/,
    'opening already parked at the end must not bloom');
  assert.match(src, /key: `bloom-\$\{bloom\}`/, 'a new key remounts the layer');
  assert.match(src, /@keyframes \$\{P\}-burst/, 'the burst keyframes');
  assert.match(src, /\.\$\{P\}-bloom\{position:absolute;left:calc\(100% - 15px\);top:13px/,
    'anchored on the right-end knob centre');
  assert.match(src, /\.\$\{P\}-halo\{/, 'the bloom ring');
  // the motes take the current level colour
  assert.match(src, /\[`--\$\{P\}-mote`\]: mixHex\(fillFor\(displayed, dark\), '#ffffff'/, 'mote colour');
  // decoration only: it must never intercept pointer events
  assert.match(src, /\.\$\{P\}-bloom\{[^}]*pointer-events:none/, 'bloom is click-through');
  assert.match(src, /\.\$\{P\}-bp\{animation-duration:\.01s;animation-delay:0s\}/,
    'reduced motion collapses the burst');
});

/* ── press / release deformation ────────────────────────────────────────── */

check('NEW: press and release deform the knob', () => {
  assert.match(src, /\.\$\{P\}-rail\.dragging \.\$\{P\}-knob\{transform:scale\(1\.16\)\}/, 'press scale — and nothing else');
  // the halo ring was removed on request: the press is a size change only
  assert.doesNotMatch(src, /pressRing/, 'no press halo may come back');
  assert.doesNotMatch(src, /\.\$\{P\}-rail\.dragging \.\$\{P\}-knob\{[^}]*box-shadow/, 'no shadow bloom on press');
  // the release springs back through an overshoot curve
  assert.match(src, /transform \.34s cubic-bezier\(\.34,1\.56,\.64,1\)/, 'spring back');
  // scale about the knob's own centre: its layout box (what the drag maths
  // reads) must not move
  assert.match(src, /transform-origin:50% 50%/, 'centre origin');
  // the puck itself stays transparent to input: the grab pad covers its
  // overhang, and one stable event target is what keeps a drag unbroken
  assert.match(src, /pointer-events:none;z-index:2;transform:scale\(1\)/, 'the knob is not a hit target');
});

/* ── the "press but it will not slide" bug ──────────────────────────────── */

check('FIX: the knob overhang is no longer a dead zone', () => {
  // the puck is 30px tall on a 26px track: its 2px overhang used to hit the
  // pane, so no pointerdown reached the rail — worst at the far-right stop,
  // where the knob is the only target left
  assert.match(src, /\.\$\{P\}-rail::before\{content:"";position:absolute;inset:-6px -3px/, 'grab pad');
  assert.match(src, /onPointerDown: pointerDown, onPointerMove: pointerMove/, 'rail starts the gesture');
  assert.match(src, /if \(!Number\.isFinite\(clientX\)\) return Math\.max\(0, index\);/, 'nearestIndex guard');
});

check('FIX: a drag cannot be interrupted mid-gesture', () => {
  // the gesture is owned by the DOCUMENT (capture phase), so losing pointer
  // capture — or never getting it — cannot strand a drag half-way
  assert.match(src, /document\.addEventListener\('pointermove', move, true\)/, 'document move listener');
  assert.match(src, /document\.addEventListener\('pointerup', up, true\)/, 'document release listener');
  assert.match(src, /document\.addEventListener\('pointercancel', cancel, true\)/, 'document cancel listener');
  // a release outside the window never reaches the document; focus loss settles it
  assert.match(src, /window\.addEventListener\('blur', blur\)/, 'focus loss settles the gesture');
  // filtered to the pointer that started the gesture
  assert.match(src, /const owns = e => pointerRef\.current === null \|\| e\.pointerId === pointerRef\.current;/, 'pointerId ownership');
  // native press-drag defaults (selection / drag-and-drop) are suppressed,
  // because THOSE are what fire pointercancel and kill a drag
  assert.match(src, /event\.preventDefault\(\);/, 'press suppresses native drag defaults');
  // capture is best-effort only, never the mechanism
  assert.match(src, /Pointer capture is a convenience, NOT the mechanism/, 'capture is documented as optional');
  // the rail's own move handler must not also apply the drag (no double work)
  const pm = src.match(/function pointerMove\(event\) \{([\s\S]*?)\n      \}/);
  assert.ok(pm, 'pointerMove found');
  assert.match(pm[1], /if \(dragRef\.current\) return;/, 'rail handler is hover-only while dragging');
});

check('FIX: hovering a tick now actually highlights it', () => {
  // this used to pass the EVENT OBJECT where a clientX was expected, so the
  // mapping was NaN and the highlight never fired
  assert.match(src, /const i = nearestIndex\(event\.clientX\);/, 'passes the coordinate');
  assert.doesNotMatch(src, /nearestIndex\(event\)[,;]/, 'never passes the event object');
});

/* ── DSH 0.2.1-rc.2 contract ────────────────────────────────────────────── */

check('0.2.1: the seat declares its label child slot and renders it', () => {
  assert.match(src, /children: \{\n\s*'conversation\.input\.model\.label': \{\n\s*kind: 'single', scope: 'session', inline: true/,
    'the child slot is declared with the shipped spec');
  assert.match(src, /renderSlot\('conversation\.input\.model\.label'/, 'and rendered');
  assert.match(src, /placement: 'trigger'/, 'trigger placement');
  assert.match(src, /placement: 'option'/, 'option placement');
  // a 0.2.0 host hands out no renderSlot; the plain name must still render
  assert.match(src, /: modelName\)/, 'plain-name fallback kept');
});

// --- report ---------------------------------------------------------------
let failed = 0;
for (const [status, name] of results) {
  if (status === 'ok') console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
