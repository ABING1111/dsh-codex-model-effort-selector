/**
 * Integration test against the SHIPPED DSH client.
 *
 * DSH 0.2.1-rc.2 moved the slot core out of the standalone
 * `@deepseek-ai/dsh-client-ui-slots` package (it no longer ships) and into the
 * assembled renderer, so the old "construct the real SlotCore" check can only
 * run where that package is still present. On 0.2.1 the decisive contract
 * changes are asserted against the shipped sources instead:
 *
 *   1. CHILD SLOTS. A seat entry now DECLARES its child slots, and a child
 *      exists only while the declaring entry is mounted. `conversation.input.model`
 *      declares `conversation.input.model.label`, which shipped packages (the
 *      1017 badge) register into. Shadowing the parent seat without declaring
 *      that child silently drops those contributions — so our registration must
 *      declare the same child, with a compatible kind/scope/inline triple.
 *   2. SHADOWING PRIORITY. The runner re-ranks every non-chain registration of a
 *      dynamically loaded package onto its own page-local ladder, so an explicit
 *      priority is advisory for dynamic packages and shadowing is automatic.
 *      On a static profile plugin the explicit `priority: -1` is what wins the
 *      cell, so it must stay present and negative.
 *
 * Every check SKIPS (exit 0) when no DSH install is found, so the suite stays
 * runnable on machines without DSH.
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

const ASAR = locateAsar();

if (!ASAR) {
  console.log('SKIP  DSH app.asar not found — integration test skipped');
  console.log('      set DSH_ASAR (or DSH_RESOURCES) to point at it and re-run');
  process.exit(0);
}
console.log(`using ${ASAR}`);

/** Read the asar's file table once; entries carry { offset, size }. */
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
  const has = (entry) => {
    const node = lookup(entry);
    return Boolean(node && node.offset !== undefined);
  };
  /** Every file path in the archive (flat). */
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
  return { read, has, walk };
}

const asar = openAsar(ASAR);

/** Which shipped client version are we inspecting? */
function shippedVersion() {
  for (const candidate of ['/dsh/package.json', '/package.json']) {
    try {
      const pkg = JSON.parse(asar.read(candidate));
      if (pkg.name === '@deepseek-ai/dsh' || pkg.name === '@deepseek-ai/dsh-desktop') {
        return { name: pkg.name, version: pkg.version };
      }
    } catch { /* keep looking */ }
  }
  return { name: 'unknown', version: 'unknown' };
}
const shipped = shippedVersion();
console.log(`shipped: ${shipped.name}@${shipped.version}`);

/* The official package that owns the seat, in either archive layout. */
const MODEL_SELECTION = [
  '/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js',
  '/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js'
].find((p) => asar.has(p));

const SLOTS_PACKAGE = [
  '/dsh/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js',
  '/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js'
].find((p) => asar.has(p));

const RUNNER = [
  '/dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js',
  '/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js'
].find((p) => asar.has(p));

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};
const skip = (name, why) => results.push(['skip', `${name} — ${why}`]);

/* ---------------------------------------------------------------------------
 * 1. Child-slot parity with the shipped seat entry.
 *
 * Both sides are read out of the shipped/official source and out of our own
 * client.js, so neither can drift silently.
 * ------------------------------------------------------------------------- */
const OUR_CLIENT = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

check('the shipped model-selection package is present', () => {
  assert.ok(MODEL_SELECTION, 'client-ui-model-selection/lib/client.js found in the asar');
});

if (MODEL_SELECTION) {
  const official = asar.read(MODEL_SELECTION);

  /* Pull the children table the shipped entry declares for the seat. */
  function officialChildrenKeys() {
    const at = official.indexOf('name: "conversation.input.model"');
    assert.ok(at > -1, 'the shipped entry registers conversation.input.model');
    // scan forward from the registration for a `children: { ... }` object
    const tail = official.slice(at, at + 2000);
    const m = tail.match(/children:\s*\{([\s\S]*?)\}\s*,\s*inject:/);
    assert.ok(m, 'the shipped entry declares a children table before inject()');
    return [...m[1].matchAll(/"([a-z0-9.\-]+)":\s*\{/gi)].map((x) => x[1]);
  }

  function ourChildrenKeys() {
    const at = OUR_CLIENT.indexOf("name: 'conversation.input.model'");
    assert.ok(at > -1, 'our entry registers conversation.input.model');
    const tail = OUR_CLIENT.slice(at, at + 1400);
    const m = tail.match(/children:\s*\{([\s\S]*?)\n\s*\},\n\s*\/\*/);
    assert.ok(m, 'our entry declares a children table');
    return [...m[1].matchAll(/'([a-z0-9.\-]+)':\s*\{/gi)].map((x) => x[1]);
  }

  const theirs = officialChildrenKeys();
  const ours = ourChildrenKeys();

  check('the shipped seat declares conversation.input.model.label', () => {
    assert.ok(theirs.includes('conversation.input.model.label'),
      `shipped children: ${JSON.stringify(theirs)}`);
  });

  check('OUR entry declares the SAME child slots as the shipped entry', () => {
    assert.deepEqual(ours.slice().sort(), theirs.slice().sort(),
      'a missing child slot silently disables every contributor to it');
  });

  check('our child specs keep kind/scope/inline compatible with the shipped one', () => {
    // the shipped child is a session-scoped inline single slot; anything else
    // would change how contributors mount
    const m = OUR_CLIENT.match(/'conversation\.input\.model\.label':\s*\{([\s\S]*?)\}/);
    assert.ok(m, 'child spec found');
    assert.match(m[1], /kind:\s*'single'/, 'kind single');
    assert.match(m[1], /scope:\s*'session'/, 'scope session');
    assert.match(m[1], /inline:\s*true/, 'inline');
  });

  check('the component renders the label child slot with a fallback', () => {
    // Declaring the child without rendering it would leave the badge invisible,
    // so the render path must call renderSlot('conversation.input.model.label').
    assert.match(OUR_CLIENT, /renderSlot\('conversation\.input\.model\.label'/,
      'renderSlot is called for the label child');
    assert.match(OUR_CLIENT, /\{\s*fallback:\s*modelName\s*\}/,
      'the catalog name is the fallback');
    assert.match(OUR_CLIENT, /placement:\s*'trigger'/, 'trigger placement');
    assert.match(OUR_CLIENT, /placement:\s*'option'/, 'option placement');
  });

  check('the component tolerates a host that has no child slots (0.2.0)', () => {
    // renderSlot only exists when children are declared; the plain name must
    // still render, so the call has to be guarded
    assert.match(OUR_CLIENT, /renderSlot\s*\n?\s*\?/,
      'renderSlot usage is conditional');
  });
}

/* ---------------------------------------------------------------------------
 * 2. Shadowing contract.
 * ------------------------------------------------------------------------- */
if (OUR_CLIENT) {
  check('our seat entry keeps an explicit negative priority', () => {
    assert.match(OUR_CLIENT, /priority:\s*-1/, 'priority -1 present');
  });
}

if (RUNNER) {
  const runner = asar.read(RUNNER);

  check('0.2.1 re-ranks dynamic registrations (shadowing is automatic)', () => {
    // the guard replaces any explicit priority for non-chain slots
    assert.match(runner, /priority = env\.allocatePriority\(\)/,
      'the runner allocates its own shadowing rank');
    assert.match(runner, /spec === void 0 \|\| spec\.kind !== "chain"/,
      'the re-rank covers every non-chain slot');
  });

  check('0.2.1 parks a contributor until its slot is declared', () => {
    // ctx.slots.inject(name, cb) is the API both we and the shipped badge use
    assert.match(runner, /slots\.inject/, 'slots.inject is part of the contract');
  });
}

/* ---------------------------------------------------------------------------
 * 3. Real SlotCore — only where the standalone package still ships (<= 0.2.0).
 * ------------------------------------------------------------------------- */
if (!SLOTS_PACKAGE) {
  skip('REAL SlotCore: single-slot duplicate throws / -1 wins / dispose restores',
    '0.2.1-rc.2 no longer ships dsh-client-ui-slots (folded into the renderer bundle)');
  skip('REAL SlotCore: the plugin definition registers and wins the seat',
    'same reason — the contract is asserted against the shipped sources above');
} else {
  const dir = mkdtempSync(join(tmpdir(), 'slots-'));
  const file = join(dir, 'slots.mjs');
  writeFileSync(file, asar.read(SLOTS_PACKAGE), 'utf8');
  const mod = await import(`file:///${file.replace(/\\/g, '/')}`);
  const SlotCore = mod.SlotCore ?? mod.default?.SlotCore ?? mod.default;

  if (typeof SlotCore !== 'function') {
    skip('REAL SlotCore assertions', 'SlotCore is not a constructor in this build');
  } else {
    /** Declare a single-kind slot the way a parent entry's children table does. */
    const declare = (core, key) => {
      const rec = core.record ? core.record(key) : core.records.get(key);
      rec.spec = { kind: 'single', scope: 'session' };
      return rec;
    };

    check('REAL SlotCore: a same-priority duplicate throws', () => {
      const core = new SlotCore();
      declare(core, 'conversation.input.model');
      core.register({ name: 'conversation.input.model' }, () => 'shipped');
      assert.throws(
        () => core.register({ name: 'conversation.input.model' }, () => 'ours'),
        /already has a registration/,
        'priority 0 would have aborted the plugin load'
      );
    });

    check('REAL SlotCore: -1 wins the cell and dispose restores the shipped entry', () => {
      const core = new SlotCore();
      declare(core, 'conversation.input.model');
      core.register({ name: 'conversation.input.model' }, () => 'shipped');
      const dispose = core.register({ name: 'conversation.input.model', priority: -1 }, () => 'ours');
      const winners = core.entriesOfSlot('conversation.input.model');
      assert.equal(winners.length, 1, 'exactly one winner');
      assert.equal(winners[0].component(), 'ours', 'our entry renders');
      assert.equal(core.entries('conversation.input.model').length, 2, 'both entries retained');
      dispose();
      const after = core.entriesOfSlot('conversation.input.model');
      assert.equal(after.length, 1, 'one winner after dispose');
      assert.equal(after[0].component(), 'shipped', 'shipped selector restored');
    });

    check('REAL SlotCore: the plugin definition registers and wins the seat', () => {
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
        __ModuleLoader__: { load: d => { globalThis.__plug = d.factory(s => (s === 'react' ? reactStub : {})); } },
        innerWidth: 1440, innerHeight: 900, addEventListener() {}, removeEventListener() {}
      };
      const doc = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
      new Function('window', 'document', 'performance', OUR_CLIENT)(win, doc, { now: () => 0 });
      globalThis.__plug.apply(ctx);
      assert.ok(captured, 'the plugin registered a slot entry');

      const core = new SlotCore();
      declare(core, 'conversation.input.model');
      core.register({ name: 'conversation.input.model' }, () => 'shipped');
      const dispose = core.register(captured.def, captured.Comp);
      const winners = core.entriesOfSlot('conversation.input.model');
      assert.equal(winners.length, 1, 'exactly one winner');
      assert.equal(winners[0].component, captured.Comp, 'the plugin component wins the seat');
      assert.equal(winners[0].options.priority, -1, 'won by lower priority');
      dispose();
      assert.equal(core.entriesOfSlot('conversation.input.model')[0].component(), 'shipped',
        'uninstall restores the shipped selector');
    });
  }
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
