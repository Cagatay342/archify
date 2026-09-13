import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { disposeBundleFixture, stageBundleFixture } from './helpers/bundle-fixture.mjs';

const cli = fileURLToPath(new URL('../bin/archify.mjs', import.meta.url));

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// Builds ownership sidecars for the three-level bundle-checkout-deep fixture:
// checkout-platform (entry) -> payments (component "payments") -> settlement (component "psp").
// The entry declares an `excluded` glob so the test can prove it is inherited two hops down.
function stageDeepLocateFixture(t) {
  const root = stageBundleFixture({ prefix: 'archify-locate-depth-', deep: true });
  t.after(() => disposeBundleFixture(root));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');

  writeJson(path.join(root, 'checkout-platform.ownership.json'), {
    schema_version: 1,
    kind: 'ownership',
    map: 'checkout-platform.json',
    excluded: ['**/*.snap'],
    components: [
      { id: 'buyers', globs: ['src/buyers/**'] },
      { id: 'edge', globs: ['src/edge/**'] },
      { id: 'checkout', globs: ['src/checkout/**'] },
      { id: 'fraud', globs: ['src/fraud/**'] },
      { id: 'orders', globs: ['src/orders/**'] },
      { id: 'queue', globs: ['src/queue/**'], child_map: 'ledger-flow.json' },
      { id: 'worker', globs: ['src/worker/**'] },
      { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
    ],
  });
  writeJson(path.join(root, 'ledger-flow.ownership.json'), {
    schema_version: 1,
    kind: 'ownership',
    map: 'ledger-flow.json',
    parent: { map: 'checkout-platform.json', component: 'queue' },
    components: [
      { id: 'event', globs: ['src/queue/event/**'] },
      { id: 'post', globs: ['src/queue/post/**'] },
      { id: 'balance', globs: ['src/queue/balance/**'] },
      { id: 'ack', globs: ['src/queue/ack/**'] },
    ],
  });
  writeJson(path.join(root, 'payments.ownership.json'), {
    schema_version: 1,
    kind: 'ownership',
    map: 'payments.json',
    parent: { map: 'checkout-platform.json', component: 'payments' },
    components: [
      { id: 'api', globs: ['src/payments/api/**'] },
      { id: 'risk', globs: ['src/payments/risk/**'] },
      { id: 'ledger', globs: ['src/payments/ledger/**'] },
      { id: 'psp', globs: ['src/payments/psp/**'], child_map: 'settlement.json' },
    ],
  });
  writeJson(path.join(root, 'settlement.ownership.json'), {
    schema_version: 1,
    kind: 'ownership',
    map: 'settlement.json',
    parent: { map: 'payments.json', component: 'psp' },
    components: [
      { id: 'acquirer', globs: ['src/payments/psp/acquirer/**'] },
      { id: 'clearing', globs: ['src/payments/psp/clearing/**'] },
      { id: 'settle-ledger', globs: ['src/payments/psp/settle-ledger/**'] },
    ],
  });

  fs.mkdirSync(path.join(root, 'src/payments/psp/acquirer'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/payments/psp/clearing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/payments/psp/acquirer/notes.snap'), 'before');
  fs.writeFileSync(path.join(root, 'src/payments/psp/clearing/batch.js'), 'before');
  git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'src/payments/psp/acquirer/notes.snap'), 'after');
  fs.writeFileSync(path.join(root, 'src/payments/psp/clearing/batch.js'), 'after');
  git('add', '.'); git('commit', '-qm', 'head'); const head = git('rev-parse', 'HEAD');

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-locate-depth-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const run = (extra = []) => spawnSync(process.execPath, [cli, 'locate', `${base}..${head}`,
    '--repo-root', root, '--map', path.join(root, 'checkout-platform.json'), '--bundle', root, '--out', out, '--json', ...extra],
  { encoding: 'utf8' });
  return { root, out, run };
}

test('a three-level bundle chains locate through entry -> payments -> settlement', (t) => {
  const { out, run } = stageDeepLocateFixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const html = fs.readFileSync(path.join(out, 'checkout-platform.locate.html'), 'utf8');
  const projection = JSON.parse(html.match(/<script id="archify-locate-projection" type="application\/json">([\s\S]*?)<\/script>/)[1]);

  // The grandchild receipt is present under its own diagram id.
  assert.ok(projection.children.settlement, 'children.settlement must be present');
  assert.ok(projection.children.payments, 'children.payments must be present');

  // A settlement-level file outside any excluded glob is reachable and touched.
  assert.equal(projection.children.settlement.nodes.clearing, 'touched');

  // The entry's `excluded: ['**/*.snap']` is inherited two hops down: a changed file that
  // would otherwise land inside the settlement "acquirer" component is suppressed.
  assert.equal(projection.children.settlement.nodes.acquirer, 'untouched');
});

function runCli(t, root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result;
}

// Builds a fresh 4-level bundle (root -> zeta -> aaa -> omega) with ownership sidecars written
// BEFORE `archify bundle` runs, so `manifest.ownership` is populated by the real build (unlike
// stageDeepLocateFixture above, which adds sidecars after staging and never exercises
// validateBundle's ownership walk). The middle diagram id ("aaa") sorts alphabetically before
// its own ancestors ("root", "zeta"), so relying on id order instead of computed `level` order
// anywhere in the walk would process it before its parent's effective ownership exists.
function stageFourLevelLocateFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-locate-4level-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specs = {
    root: { components: [{ id: 'gatewayComp', type: 'backend', label: 'Gateway', pos: [40, 40], size: [120, 60], drilldown: 'zeta' }] },
    zeta: { components: [{ id: 'coreComp', type: 'backend', label: 'Core', pos: [40, 40], size: [120, 60], drilldown: 'aaa' }] },
    aaa: { components: [{ id: 'innerComp', type: 'backend', label: 'Inner', pos: [40, 40], size: [120, 60], drilldown: 'omega' }] },
    omega: {
      components: [
        { id: 'leafComp', type: 'backend', label: 'Leaf', pos: [40, 40], size: [120, 60] },
        { id: 'secretComp', type: 'backend', label: 'Secret', pos: [220, 40], size: [120, 60] },
      ],
    },
  };
  for (const [id, body] of Object.entries(specs)) {
    writeJson(path.join(root, `${id}.json`), {
      schema_version: 1, diagram_type: 'architecture', meta: { title: id }, ...body,
    });
  }

  // Ownership sidecars are written before the bundle is built, so `chooseOwnershipFile` binds
  // `manifest.ownership` to root's sidecar and `validateBundle`'s ownership walk covers all four
  // levels on every subsequent `--check` (including the one `archify locate --bundle` runs).
  writeJson(path.join(root, 'root.ownership.json'), {
    schema_version: 1, kind: 'ownership', map: 'root.json',
    components: [{ id: 'gatewayComp', globs: ['src/gw/**'], child_map: 'zeta.json' }],
  });
  writeJson(path.join(root, 'zeta.ownership.json'), {
    schema_version: 1, kind: 'ownership', map: 'zeta.json',
    parent: { map: 'root.json', component: 'gatewayComp' },
    // An intermediate (non-entry) ancestor's own exclusion, inherited two hops further down.
    // Excluded globs are checked as a subset of the parent's own named component glob too
    // ("src/gw/**" here), so this has to be a literal extension of it, not a bare "**/*.secret".
    excluded: ['src/gw/**/*.secret'],
    components: [{ id: 'coreComp', globs: ['src/gw/core/**'], child_map: 'aaa.json' }],
  });
  writeJson(path.join(root, 'aaa.ownership.json'), {
    schema_version: 1, kind: 'ownership', map: 'aaa.json',
    parent: { map: 'zeta.json', component: 'coreComp' },
    components: [{ id: 'innerComp', globs: ['src/gw/core/inner/**'], child_map: 'omega.json' }],
  });
  writeJson(path.join(root, 'omega.ownership.json'), {
    schema_version: 1, kind: 'ownership', map: 'omega.json',
    parent: { map: 'aaa.json', component: 'innerComp' },
    components: [
      { id: 'leafComp', globs: ['src/gw/core/inner/leaf/**'] },
      { id: 'secretComp', globs: ['src/gw/core/inner/secret/**'] },
    ],
  });

  for (const id of Object.keys(specs)) {
    runCli(t, root, ['render', 'architecture', path.join(root, `${id}.json`), path.join(root, `${id}.html`)]);
  }
  runCli(t, root, ['bundle', root, '--json']);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.ownership, 'manifest.ownership must be set from the pre-existing sidecars');
  assert.equal(manifest.max_depth, 4);

  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  fs.mkdirSync(path.join(root, 'src/gw/core/inner/leaf'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/gw/core/inner/secret'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/gw/core/inner/leaf/ok.js'), 'before');
  fs.writeFileSync(path.join(root, 'src/gw/core/inner/secret/data.secret'), 'before');
  git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'src/gw/core/inner/leaf/ok.js'), 'after');
  fs.writeFileSync(path.join(root, 'src/gw/core/inner/secret/data.secret'), 'after');
  git('add', '.'); git('commit', '-qm', 'head'); const head = git('rev-parse', 'HEAD');

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-locate-4level-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const run = (extra = []) => spawnSync(process.execPath, [cli, 'locate', `${base}..${head}`,
    '--repo-root', root, '--map', path.join(root, 'root.json'), '--bundle', root, '--out', out, '--json', ...extra],
  { encoding: 'utf8' });
  return { root, out, run };
}

test('a four-level bundle whose ids sort out of dependency order still chains locate correctly, and a non-entry ancestor\'s excluded is inherited two hops down', (t) => {
  const { out, run } = stageFourLevelLocateFixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const html = fs.readFileSync(path.join(out, 'root.locate.html'), 'utf8');
  const projection = JSON.parse(html.match(/<script id="archify-locate-projection" type="application\/json">([\s\S]*?)<\/script>/)[1]);

  assert.ok(projection.children.zeta, 'children.zeta must be present');
  assert.ok(projection.children.aaa, 'children.aaa must be present');
  assert.ok(projection.children.omega, 'children.omega must be present');

  // A normal change at the deepest level is still reachable and touched.
  assert.equal(projection.children.omega.nodes.leafComp, 'touched');

  // zeta's own `excluded: ['**/*.secret']` (an intermediate, non-entry ancestor) is inherited
  // through aaa down to omega, two levels further down the chain.
  assert.equal(projection.children.omega.nodes.secretComp, 'untouched');
});
