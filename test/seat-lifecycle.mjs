/**
 * REGRESSION TEST · incident 20 · "switching the plugin off makes the model
 * selector vanish from the composer".
 *
 * This test replays the real seat lifecycle against the REAL shipped slot
 * registry, extracted verbatim from the DSH install's web-frontend bundle.
 * Nothing here is a mock of the registry: the `SlotCore` below is the code the
 * shipped app runs.
 *
 * WHY THE BUG HAPPENED
 * --------------------
 * `conversation.input.model` is a `single` slot with a child slot,
 * `conversation.input.model.label`. A child slot may be DECLARED by exactly
 * one entry: the registry throws
 *
 *     slot "..." is already declared (by an entry in "...")
 *
 * for the second declarer. The shipped `@deepseek-ai/dsh-client-ui-model-selection`
 * declares that child; so did this plugin. We register FIRST (this package is
 * a dynamic bundle with `immediately: true`), so the SHIPPED registration
 * threw and never reached the ledger.
 *
 * The seat was therefore held by this plugin alone. When the plugin was
 * switched off, its entry was disposed and the seat became EMPTY — the
 * official selector could not come back, because it had never been
 * registered. Hence: "once I turn this plugin off, the model selector
 * disappears from the message bar".
 *
 * THE FIX
 * -------
 * We no longer declare that child slot. The shipped entry registers normally,
 * so the seat always has two occupants and the official one is restored the
 * moment this plugin is removed.
 *
 * The cost is the shipped "1017" badge, which decorates the model name: while
 * this plugin holds the seat, the badge is not drawn. That is the only
 * outcome that keeps the selector itself alive across an uninstall.
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUR_CLIENT = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

/**
 * The source with every comment removed.
 *
 * Several assertions below are about what the code DOES, and the file
 * documents the incident at length in comments that quote the very calls
 * being forbidden. Matching the raw text would therefore pass on a comment
 * and fail on a call — the opposite of what the assertion means. Strip
 * comments first, then assert on code.
 */
const CODE = OUR_CLIENT
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
  .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (not `://` in a URL)

const SEAT = 'conversation.input.model';
const LABEL = 'conversation.input.model.label';

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};
const skip = (name, why) => results.push(['skip', `${name} — ${why}`]);

/* ---------------------------------------------------------------------------
 * 1. Locate the DSH install and the bundle that owns the slot registry.
 *
 * The registry is folded into the assembled browser bundle, not into a
 * separately published package, so it is located by the error string only the
 * registry itself throws. A machine without DSH just skips.
 * ------------------------------------------------------------------------- */
function locateAsar() {
  const candidates = [];
  const push = (p) => { if (p && !candidates.includes(p)) candidates.push(p); };
  push(process.env.DSH_ASAR);
  const res = process.env.DSH_RESOURCES;
  if (res) { push(join(res, 'app.asar')); push(join(res, 'app.asar.unpacked')); }
  const local = process.env.LOCALAPPDATA;
  if (local) push(join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'));
  const pf = process.env.ProgramFiles, pfx = process.env['ProgramFiles(x86)'];
  for (const root of [pf, pfx]) {
    if (root) push(join(root, 'DeepSeek Harness', 'resources', 'app.asar'));
  }
  push('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar');
  push('/opt/DeepSeek Harness/resources/app.asar');
  return candidates.find((p) => existsSync(p)) || null;
}

const ASAR = locateAsar();

/** Read the asar file table once; entries carry { offset, size }. */
function openAsar(path) {
  const fd = readFileSync(path);
  const headerSize = fd.readUInt32LE(12);
  const header = JSON.parse(fd.subarray(16, 16 + headerSize).toString('utf8').replace(/\0+$/, ''));
  const base = 16 + headerSize;
  const lookup = (entry) => {
    let node = header;
    for (const part of entry.replace(/^\//, '').split('/')) node = node?.files?.[part];
    return node;
  };
  const read = (entry) => {
    const node = lookup(entry);
    if (!node || node.offset === undefined) throw new Error(`no such file: ${entry}`);
    const off = base + Number(node.offset);
    return fd.subarray(off, off + Number(node.size)).toString('utf8');
  };
  const walk = () => {
    const out = [];
    const visit = (node, prefix) => {
      for (const [name, child] of Object.entries(node.files ?? {})) {
        const path = `${prefix}/${name}`;
        if (child.files) visit(child, path); else out.push(path);
      }
    };
    visit(header, '');
    return out;
  };
  return { read, has: (e) => Boolean(lookup(e)?.offset !== undefined), walk };
}

if (!ASAR) {
  console.log('SKIP  DSH app.asar not found — seat lifecycle test skipped');
  console.log('      set DSH_ASAR (or DSH_RESOURCES) to point at it and re-run');
  process.exit(0);
}

const asar = openAsar(ASAR);

/* The bundle that owns the slot registry: the one containing the string the
 * registry throws when a child slot is declared twice. */
const REGISTRY_MARKER = 'is already declared (by';
const REGISTRY_BUNDLE = asar.walk().find((p) => {
  if (!p.endsWith('.js')) return false;
  try { return asar.read(p).includes(REGISTRY_MARKER); } catch { return false; }
});

/* ---------------------------------------------------------------------------
 * 2. Extract the registry verbatim and load it as a module.
 * ------------------------------------------------------------------------- */
const SLOT_CORE_START = 'function xI(e){return`use${e[0]?.toUpperCase()';
const SLOT_CORE_END = ',jI="modulepreload"';

let SlotCore = null;

if (!REGISTRY_BUNDLE) {
  skip('the seat lifecycle is replayed against the real registry', 'registry bundle not found');
} else {
  const text = asar.read(REGISTRY_BUNDLE);
  const start = text.indexOf(SLOT_CORE_START);
  const end = text.indexOf(SLOT_CORE_END, start);
  if (start === -1 || end === -1) {
    skip('the seat lifecycle is replayed against the real registry', 'registry region not found');
  } else {
    const region = text.slice(start, end);
    const dir = mkdtempSync(join(tmpdir(), 'slot-core-'));
    const file = join(dir, 'slot-core.mjs');
    writeFileSync(file, `${region}\nexport { $I as SlotCore };\n`, 'utf8');
    const mod = await import(`file:///${file.replace(/\\/g, '/')}`);
    SlotCore = mod.SlotCore;
  }
}

if (SlotCore) {
  console.log(`using the shipped registry from ${REGISTRY_BUNDLE}`);

  /* -----------------------------------------------------------------------
   * The two seat entries, in the exact shapes the shipped sources use.
   * ----------------------------------------------------------------------- */
  const shippedDef = {
    name: SEAT,
    locale: 'model',
    children: { [LABEL]: { kind: 'single', scope: 'session', inline: true } },
    inject: () => ({})
  };
  const shipped = () => null;   // never called: entries are identified by locale

  /** A registry with the seat slot declared (the conversation UI declares it). */
  const newCore = () => {
    const core = new SlotCore();
    const rec = core.record(SEAT);
    rec.spec = { kind: 'single', scope: 'session' };
    return core;
  };

  /**
   * Which entry is rendering the seat.
   *
   * The registry keeps only key/id/order/label/priority on the entry's
   * options, so the component function is the identity to compare. It is
   * never CALLED: ours is a React function that would need a React runtime.
   */
  const state = (core) => {
    const winners = core.entriesOfSlot(SEAT);
    return {
      ledger: core.entries(SEAT).length,
      winners: winners.length,
      rendered: winners.length ? winners[0].component : null
    };
  };

  /**
   * Our entry — the ACTUAL registration object.
   *
   * `client.js` is executed the way the host executes it (through the module
   * loader stub), and the definition it hands to `slots.register` is captured.
   * Deriving the shape from the source with a regex would let the test pass
   * while the shipped object differs; this way the registry sees exactly what
   * the plugin really registers.
   */
  function ourDefinition() {
    const reactStub = {
      createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
      useState: v => [typeof v === 'function' ? v() : v, () => {}],
      useEffect: () => {}, useLayoutEffect: () => {}, useMemo: fn => fn(),
      useRef: v => ({ current: v }), useSyncExternalStore: (s, g) => g(),
      Fragment: 'Fragment'
    };
    let captured = null;
    const ctx = {
      effect: fn => fn(),
      locale: { register() {}, bind: () => k => k },
      slots: {
        inject: (name, cb) => cb(),
        register: (def, Comp) => { captured = { def, Comp }; return () => {}; }
      },
      modelDirectories: {
        directoryFor: () => ({
          store: { subscribe: () => () => {}, getSnapshot: () => ({ current: null, pending: null, groups: [], status: 'idle' }) },
          load: () => Promise.resolve(), select: () => Promise.resolve({ ok: true })
        })
      },
      sessions: { subagentAddress: () => undefined }
    };
    const win = {
      __ModuleLoader__: { load: d => { globalThis.__cmesPlugin = d.factory(s => (s === 'react' ? reactStub : {})); } },
      innerWidth: 1440, innerHeight: 900, addEventListener() {}, removeEventListener() {}
    };
    const doc = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };

    new Function('window', 'document', 'performance', OUR_CLIENT)(win, doc, { now: () => 0 });
    globalThis.__cmesPlugin.apply(ctx);
    assert.ok(captured, 'the plugin registered a seat entry');
    return { def: captured.def, Comp: captured.Comp };
  }

  /* -----------------------------------------------------------------------
   * 3. The regression itself.
   * ----------------------------------------------------------------------- */
  check('our seat entry does NOT declare the child slot the shipped entry owns', () => {
    const { def } = ourDefinition();
    assert.equal(def.children, undefined,
      'declaring conversation.input.model.label kills the shipped registration (incident 20)');
  });

  check('the shipped entry registers successfully while we hold the seat', () => {
    const core = newCore();
    const { def, Comp } = ourDefinition();
    core.register(def, Comp);
    // The whole bug lived in this one call throwing.
    core.register(shippedDef, shipped);
    const s = state(core);
    assert.equal(s.ledger, 2, 'both entries are on the ledger');
    assert.equal(s.winners, 1, 'exactly one winner');
    assert.equal(s.rendered, Comp, 'our shadow wins the cell');
  });

  check('disabling our plugin RESTORES the shipped model selector', () => {
    const core = newCore();
    const { def, Comp } = ourDefinition();
    const disposeOurs = core.register(def, Comp);
    core.register(shippedDef, shipped);

    disposeOurs();

    const s = state(core);
    assert.equal(s.winners, 1, 'the seat must not be empty — that is the reported bug');
    assert.equal(s.rendered, shipped,
      'the official selector must come back when our plugin is switched off');
  });

  check('the fix holds in the OTHER registration order too', () => {
    // Which side registers first depends on load order, and it has changed
    // between host versions. The seat must survive either order.
    const core = newCore();
    const { def, Comp } = ourDefinition();
    core.register(shippedDef, shipped);   // official FIRST this time
    const disposeOurs = core.register(def, Comp);

    let s = state(core);
    assert.equal(s.ledger, 2, 'both entries are on the ledger');
    assert.equal(s.rendered, Comp, 'our shadow still wins the cell');

    disposeOurs();
    s = state(core);
    assert.equal(s.winners, 1, 'the seat must not be empty');
    assert.equal(s.rendered, shipped, 'the official selector is back');
  });

  /* -----------------------------------------------------------------------
   * 4. The control: prove the OLD shape really did break it.
   *
   * A test that only checks the fixed shape cannot tell "fixed" from
   * "the test never reached the failing path". The buggy shape is replayed
   * here so the failure mode is executable, not folklore.
   * ----------------------------------------------------------------------- */
  check('CONTROL: declaring the child slot really does empty the seat on unload', () => {
    const core = newCore();
    const { def, Comp } = ourDefinition();
    const buggy = { ...def, children: { [LABEL]: { kind: 'single', scope: 'session', inline: true } } };
    const disposeOurs = core.register(buggy, Comp);

    let shippedThrew = false;
    try { core.register(shippedDef, shipped); }
    catch { shippedThrew = true; }
    assert.ok(shippedThrew, 'the shipped registration must throw when we own the child');

    disposeOurs();
    const s = state(core);
    assert.equal(s.winners, 0, 'the buggy shape leaves the seat empty');
    assert.equal(s.rendered, null, 'nothing renders — the model selector is gone');
  });

  /* -----------------------------------------------------------------------
   * 5. The component must not ask for a child slot it does not own.
   * ----------------------------------------------------------------------- */
  check('the component never calls renderSlot for the child slot', () => {
    // The renderer only builds a `renderSlot` binding for an entry that
    // declares children, and it authorizes only that entry's own keys. We
    // declare no children, so any renderSlot call would be a no-op at best
    // and a SlotOwnershipError at worst.
    const calls = [...CODE.matchAll(/renderSlot\s*\(/g)];
    assert.equal(calls.length, 0,
      `expected no renderSlot( call, found ${calls.length}`);
  });

  check('the component no longer takes a renderSlot prop', () => {
    const sig = CODE.match(/function Selector\(([^)]*)\)/);
    assert.ok(sig, 'Selector signature found');
    assert.doesNotMatch(sig[1], /renderSlot/,
      'the prop is gone; the renderer never supplies it without children');
  });

  check('the model name is still rendered in the trigger', () => {
    // the trigger's caption span carries the catalog model name:
    //   h('span', { className: `${P}-caption` }, modelName)
    assert.match(CODE, /className: `\$\{P\}-caption`\s*\}\s*,\s*modelName\)/s,
      'the trigger renders the catalog model name');
  });
} else {
  skip('the seat lifecycle is replayed against the real registry', 'registry not extractable');
}

/* ---------------------------------------------------------------------------
 * report
 * ------------------------------------------------------------------------- */
let failed = 0;
for (const [status, name] of results) {
  if (status === 'ok') console.log(`  ok   ${name}`);
  else if (status === 'skip') console.log(`  skip ${name}`);
  else { failed++; console.log(`  FAIL ${name}`); }
}
const ran = results.filter((r) => r[0] !== 'skip').length;
console.log(`\n${ran - failed}/${ran} passed (${results.length - ran} skipped)`);
process.exit(failed ? 1 : 0);
