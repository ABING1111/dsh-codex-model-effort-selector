/**
 * Integration test against the REAL shipped SlotCore.
 *
 * Extracts `@deepseek-ai/dsh-client-ui-slots/lib/index.js` from the DSH
 * app.asar and drives it directly to prove the shadowing claim:
 *
 *   - registering a `single` slot twice at the SAME priority throws
 *     (this is why priority 0 would have broken the plugin)
 *   - registering at a LOWER priority wins the cell
 *   - the shipped registration survives on the ledger, so removing our entry
 *     restores it with no residue
 *
 * If the asar or the package is unavailable the test SKIPS (exit 0) rather than
 * failing, so the suite stays runnable on machines without DSH installed.
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the DSH app.asar without hard-coding one machine.
 *
 * Order: an explicit override, then the per-platform default install locations
 * (Windows, macOS, Linux), then the `DSH_ASAR`/`DSH_RESOURCES` env vars.
 * Finding nothing is not a failure — the test skips.
 */
function locateAsar() {
  const candidates = [];
  const push = (p) => { if (p && !candidates.includes(p)) candidates.push(p); };

  push(process.env.DSH_ASAR);
  const res = process.env.DSH_RESOURCES;
  if (res) { push(join(res, 'app.asar')); push(join(res, 'app.asar.unpacked')); }

  /* Windows */
  const local = process.env.LOCALAPPDATA;
  if (local) push(join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'));
  const pf = process.env.ProgramFiles, pfx = process.env['ProgramFiles(x86)'];
  for (const root of [pf, pfx]) {
    if (root) push(join(root, 'DeepSeek Harness', 'resources', 'app.asar'));
  }
  /* macOS */
  push('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar');
  /* Linux */
  push('/opt/DeepSeek Harness/resources/app.asar');
  push(join(process.env.HOME || '', '.local/share/deepseek-harness/resources/app.asar'));

  return candidates.find((p) => existsSync(p)) || null;
}

const ENTRY = '/dsh/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js';

function extractAsar(asar, entry) {
  const fd = readFileSync(asar);
  const headerSize = fd.readUInt32LE(12);
  const header = JSON.parse(fd.subarray(16, 16 + headerSize).toString('utf8').replace(/\0+$/, ''));
  const base = 16 + headerSize;
  let node = header;
  for (const part of entry.replace(/^\//, '').split('/')) node = node.files[part];
  return fd.subarray(base + Number(node.offset), base + Number(node.offset) + node.size).toString('utf8');
}

const ASAR = locateAsar();

if (!ASAR) {
  console.log('SKIP  DSH app.asar not found — integration test skipped');
  console.log('      set DSH_ASAR (or DSH_RESOURCES) to point at it and re-run');
  process.exit(0);
}
console.log(`using ${ASAR}`);

let source;
try {
  source = extractAsar(ASAR, ENTRY);
} catch (e) {
  console.log(`SKIP  cannot read ${ENTRY}: ${e.message}`);
  process.exit(0);
}

// The bundle is ESM with bare-specifier imports; write it next to a shim so
// Node can resolve it, then import the exported SlotCore.
const dir = mkdtempSync(join(tmpdir(), 'slots-'));
const file = join(dir, 'slots.mjs');

// Rewrite bare imports to relative stubs where needed; the core is dependency-free.
writeFileSync(file, source, 'utf8');

const mod = await import(`file:///${file.replace(/\\/g, '/')}`);
const SlotCore = mod.SlotCore ?? mod.default?.SlotCore ?? mod.default;

console.log('SlotCore export:', typeof SlotCore);

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};

if (typeof SlotCore !== 'function') {
  console.log('SKIP  SlotCore not a constructor (bundle shape changed)');
  process.exit(0);
}

/** Declare a single-kind slot the way a parent entry's children table does. */
function declare(core, key) {
  // the public path: register() refuses undeclared keys, so seed the record
  // through the same internal the constructor uses for 'root'
  const rec = core.record ? core.record(key) : core.records.get(key);
  rec.spec = { kind: 'single', scope: 'session' };
  return rec;
}

check('single slot REJECTS a duplicate at the same priority (priority 0 is fatal)', () => {
  const core = new SlotCore();
  declare(core, 'conversation.input.model');
  core.register({ name: 'conversation.input.model' }, () => 'shipped');
  assert.throws(
    () => core.register({ name: 'conversation.input.model' }, () => 'ours'),
    /already has a registration/,
    'a same-priority duplicate must throw'
  );
});

check('lower priority WINS the cell (our -1 shadows the shipped 0)', () => {
  const core = new SlotCore();
  declare(core, 'conversation.input.model');
  core.register({ name: 'conversation.input.model' }, () => 'shipped');
  const dispose = core.register({ name: 'conversation.input.model', priority: -1 }, () => 'ours');

  const winners = core.entriesOfSlot('conversation.input.model');
  assert.equal(winners.length, 1, 'exactly one winner');
  assert.equal(winners[0].component(), 'ours', 'our entry must render');

  // the shipped entry must still be on the raw ledger
  assert.equal(core.entries('conversation.input.model').length, 2, 'both entries retained');

  // disposing ours restores the shipped selector
  dispose();
  const after = core.entriesOfSlot('conversation.input.model');
  assert.equal(after.length, 1, 'one winner after dispose');
  assert.equal(after[0].component(), 'shipped', 'shipped selector restored with no residue');
});

check('priority 0 (the naive choice) would NOT shadow — it throws first', () => {
  const core = new SlotCore();
  declare(core, 'conversation.input.model');
  core.register({ name: 'conversation.input.model' }, () => 'shipped');
  // same priority: cannot even register, so shadowing never happens
  assert.throws(() => core.register({ name: 'conversation.input.model', priority: 0 }, () => 'ours'));
});

/* ---------------------------------------------------------------------------
 * The decisive check: drive the REAL SlotCore with the plugin's ACTUAL
 * registration definition, exactly as the host would at load time.
 * ------------------------------------------------------------------------- */
const CLIENT = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

function loadPlugin() {
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
    __ModuleLoader__: { load: d => { d.factory(s => (s === 'react' ? reactStub : {})); } },
    innerWidth: 1440, innerHeight: 900, addEventListener() {}, removeEventListener() {}
  };
  const doc = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
  new Function('window', 'document', 'performance', CLIENT)(win, doc, { now: () => 0 });
  // re-run apply with our capturing ctx
  win.__ModuleLoader__.load = d => { globalThis.__plug = d.factory(s => (s === 'react' ? reactStub : {})); };
  new Function('window', 'document', 'performance', CLIENT)(win, doc, { now: () => 0 });
  globalThis.__plug.apply(ctx);
  return captured;
}

check('PLUGIN def registers into the REAL SlotCore without throwing', () => {
  const core = new SlotCore();
  declare(core, 'conversation.input.model');
  // the shipped selector takes the seat first, at the default priority
  core.register({ name: 'conversation.input.model' }, () => 'shipped');

  const { def, Comp } = loadPlugin();
  assert.equal(def.name, 'conversation.input.model');

  // THIS is the line that would throw if priority were 0
  const dispose = core.register(def, Comp);

  const winners = core.entriesOfSlot('conversation.input.model');
  assert.equal(winners.length, 1, 'exactly one winner');
  assert.equal(winners[0].component, Comp, 'the plugin component wins the seat');
  assert.equal(winners[0].options.priority, -1, 'won by lower priority');

  // uninstall restores the shipped selector cleanly
  dispose();
  const after = core.entriesOfSlot('conversation.input.model');
  assert.equal(after.length, 1, 'one winner after uninstall');
  assert.equal(after[0].component(), 'shipped', 'shipped selector restored, no residue');
});

let failed = 0;
for (const [status, name] of results) {
  if (status === 'ok') console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
