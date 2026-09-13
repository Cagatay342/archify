import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BundleError, buildBundleManifest, buildTree, htmlArtifactSha256, validateBundle, validateOwnershipSubset } from '../bundle/diagram-bundle.mjs';
import { disposeBundleFixture, stageBundleFixture } from './helpers/bundle-fixture.mjs';

function stageDeep() {
  return stageBundleFixture({ prefix: 'archify-bundle-depth-', deep: true });
}

function patchManifest(dir, mutate) {
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(manifest);
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function expectFailure(dir, snippet) {
  assert.throws(
    () => validateBundle(dir),
    (error) => error instanceof BundleError
      && (error.code === 'bundle/invalid')
      && (error.details.failures || []).some((item) => String(item).includes(snippet)),
  );
}

test('deep fixture bundle produces a 3-level manifest and passes every --check', () => {
  const dir = stageDeep();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.entry, 'checkout-platform');
    assert.equal(manifest.max_depth, 3);
    assert.equal(manifest.diagrams.length, 4);
    assert.equal(manifest.diagrams.find((item) => item.id === 'checkout-platform').level, 0);
    assert.equal(manifest.diagrams.find((item) => item.id === 'payments').level, 1);
    assert.equal(manifest.diagrams.find((item) => item.id === 'ledger-flow').level, 1);
    assert.equal(manifest.diagrams.find((item) => item.id === 'settlement').level, 2);
    assert.equal(manifest.drilldowns.length, 3);
    assert.deepEqual(
      manifest.drilldowns.map((row) => `${row.parent}>${row.component}>${row.child}`),
      ['checkout-platform>queue>ledger-flow', 'checkout-platform>payments>payments', 'payments>psp>settlement'],
    );
    assert.deepEqual(validateBundle(dir), { ok: true, checksPassed: 10, checkCount: 10 });
  } finally {
    disposeBundleFixture(dir);
  }
});

// Scoped to one diagram's `"id": "<id>" ... "artifact_sha256": "<hex>"` block — id values are
// unique per diagram and no other id-bearing object sits between a diagram's own id and its own
// artifact_sha256 (file/diagram_type/title/level/node_count/spec_sha256 in between, nothing else),
// so the non-greedy span can't cross into a different diagram's fields.
function substituteArtifactDigest(text, id, newHex) {
  const pattern = new RegExp(`("id":\\s*${JSON.stringify(id)}[\\s\\S]*?"artifact_sha256":\\s*")[a-f0-9]{64}(")`);
  let matched = false;
  const result = text.replace(pattern, (_full, prefix, suffix) => {
    matched = true;
    return `${prefix}${newHex}${suffix}`;
  });
  return { result, matched };
}

test('the existing 2-level fixture manifest is bundle-logic byte-identical to the pre-N-depth reference; artifact digests are renderer-dependent and verified from disk', () => {
  // manifest.reference.json was produced by the pre-N-depth code, not the current one: a clean
  // `git worktree` checkout of commit cc1b33a (the parent of this branch's first Faz 1 commit,
  // before any ownership/N-depth change existed) rendering and bundling this exact same
  // test/fixtures/bundle-checkout spec trio with `node bin/archify.mjs render ...` +
  // `node bin/archify.mjs bundle <dir> --json`. That worktree's node_modules was never installed,
  // which is fine — `bundle`/`render` do not import any devDependency at runtime, only the
  // (unrelated) `npm run generate:validators` script does. The resulting manifest.json bytes were
  // copied in unmodified; nothing here regenerates or re-derives it.
  //
  // `artifact_sha256` is intentionally NOT held byte-fixed here: it is a hash of the rendered HTML,
  // so it legitimately changes whenever the viewer/renderer template changes (as happened in a
  // later, unrelated Faz 2 change) even though the bundle/manifest LOGIC this test exists to pin
  // did not. Freezing it in the reference would make this test fail on every renderer touch-up for
  // a reason unrelated to what it checks, or — worse — get "fixed" by regenerating the reference
  // and silently losing coverage of a real manifest-shape regression. So the proof is split:
  // (a) each of the NEWLY BUILT manifest's artifact_sha256 values is independently verified against
  //     the actual .html bytes on disk (via the same htmlArtifactSha256 the bundle step itself uses
  //     to compute it, but reading the file fresh here rather than trusting the manifest's claim);
  // (b) the reference text is patched, digest-by-digest, replacing ONLY each diagram's
  //     artifact_sha256 (matched as a scoped 64-hex value, never touched by field-shape or
  //     ordering) with that same diagram's freshly-verified value from (a), and the two manifests
  //     are then compared with full Buffer equality — no other masking (spec_sha256, ownership
  //     sha256, whitespace, field order) is applied anywhere.
  const referencePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures/bundle-checkout/manifest.reference.json',
  );
  const reference = fs.readFileSync(referencePath);
  const dir = stageBundleFixture({ prefix: 'archify-bundle-depth-shallow-' });
  try {
    const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));

    // (a) Each artifact_sha256 the freshly built manifest claims must equal the real digest of the
    // .html file actually sitting on disk — independent proof the manifest isn't merely internally
    // self-consistent but wrong about the artifact it describes.
    for (const diagram of manifest.diagrams) {
      const htmlBytes = fs.readFileSync(path.join(dir, diagram.file));
      const actualArtifactSha = htmlArtifactSha256(htmlBytes);
      assert.equal(
        diagram.artifact_sha256, actualArtifactSha,
        `${diagram.id}: manifest artifact_sha256 does not match the real sha256 of ${diagram.file} on disk`,
      );
    }

    // (b) Patch the reference text's artifact_sha256 values (only) to the new manifest's, then
    // require full Buffer equality on everything else.
    let patchedReference = reference.toString('utf8');
    let substitutions = 0;
    for (const diagram of manifest.diagrams) {
      const { result, matched } = substituteArtifactDigest(patchedReference, diagram.id, diagram.artifact_sha256);
      assert.ok(matched, `reference manifest has no artifact_sha256 block for diagram id ${JSON.stringify(diagram.id)}`);
      patchedReference = result;
      substitutions += 1;
    }
    assert.equal(substitutions, manifest.diagrams.length);
    const referenceManifest = JSON.parse(reference.toString('utf8'));
    assert.equal(referenceManifest.diagrams.length, manifest.diagrams.length, 'reference and new manifest must describe the same number of diagrams');

    const patchedReferenceBytes = Buffer.from(patchedReference, 'utf8');
    assert.ok(
      Buffer.compare(manifestBytes, patchedReferenceBytes) === 0,
      `manifest.json is not byte-identical to the pre-N-depth reference (artifact_sha256 values excepted).\n--- new ---\n${manifestBytes.toString('utf8')}\n--- reference (artifact digests patched to new) ---\n${patchedReference}`,
    );
    assert.deepEqual(validateBundle(dir), { ok: true, checksPassed: 10, checkCount: 10 });
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when two rows target the same child (bundle/drilldown-shared)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.drilldowns.push({ parent: 'checkout-platform', component: 'fraud', child: 'settlement' });
    });
    expectFailure(dir, 'bundle/drilldown-shared: settlement');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when a drilldown row points back at an ancestor (bundle/drilldown-cycle)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.drilldowns.push({ parent: 'settlement', component: 'clearing', child: 'payments' });
    });
    expectFailure(dir, 'bundle/drilldown-cycle: payments');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when a diagram is unreachable from the entry (bundle/orphan)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.drilldowns = manifest.drilldowns.filter((row) => !(row.parent === 'checkout-platform' && row.component === 'payments'));
    });
    expectFailure(dir, 'bundle/orphan');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when a diagram level does not match the computed depth (bundle/child-level)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.diagrams.find((item) => item.id === 'settlement').level = 5;
    });
    expectFailure(dir, 'bundle/child-level');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when max_depth does not match the computed depth (bundle/max-depth)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.max_depth = 4;
    });
    expectFailure(dir, 'bundle/max-depth');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle fails when a leaf diagram still carries a drilldown mark (bundle/leaf-mark)', () => {
  const dir = stageDeep();
  try {
    const htmlPath = path.join(dir, 'settlement.html');
    const html = fs.readFileSync(htmlPath, 'utf8').replace(
      /data-node-id="acquirer"/,
      'data-node-id="acquirer" data-drilldown-child="nope"',
    );
    fs.writeFileSync(htmlPath, html);
    const artifactSha = createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex');
    patchManifest(dir, (manifest) => {
      manifest.diagrams.find((item) => item.id === 'settlement').artifact_sha256 = artifactSha;
    });
    expectFailure(dir, 'bundle/leaf-mark');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('an intermediate (non-leaf) diagram keeps its drilldown mark without failing leaf-mark', () => {
  const dir = stageDeep();
  try {
    const html = fs.readFileSync(path.join(dir, 'payments.html'), 'utf8');
    assert.match(html, /data-drilldown-child="/);
    assert.deepEqual(validateBundle(dir), { ok: true, checksPassed: 10, checkCount: 10 });
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle rejects a bundle deeper than the 8-level cap (bundle/depth-exceeded or schema rejection)', () => {
  const dir = stageDeep();
  try {
    patchManifest(dir, (manifest) => {
      manifest.max_depth = 9;
    });
    assert.throws(
      () => validateBundle(dir),
      (error) => error instanceof BundleError
        && (error.code === 'bundle/invalid')
        && (error.details.failures || []).some((item) => String(item).includes('bundle/depth-exceeded') || String(item).includes('bundle/schema')),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

// Two diagrams at different levels can legitimately declare a component with the same id
// (e.g. "queue" in two unrelated diagrams) and even target the SAME child by mistake; matching
// by component name alone (the pre-fix behavior) cannot tell those rows apart, so
// validateOwnershipSubset must fall back to parent.map to pick the right one. `components` is a
// real, schema-valid `{id, globs}` entry throughout — an empty `components: []` fails the real
// ownership schema's `minItems: 1` on its own, which would mask whether the map-matching logic
// under test actually ran.
// These unit-level calls exercise validateOwnershipSubset's manifest-only fallback branch (no
// parentSidecarPath — no real walk to check against, e.g. validating a declared parent in
// isolation). sidecarPath is now a required parameter: identity is derived from it exactly as the
// real walk in validateBundle does (`<id>.ownership.json` -> `<id>.json`, matched against
// manifest.diagrams[].file), so every diagram these sidecars claim to be — including "y" itself —
// must be listed in `diagrams[]`, and bundleDir is a fixed fake absolute path used only for
// string-level path.resolve; no file on disk is ever read.
const FAKE_BUNDLE_DIR = '/bundle';
function sidecarPathFor(id) {
  return path.join(FAKE_BUNDLE_DIR, `${id}.ownership.json`);
}

function collidingComponentManifest() {
  return {
    entry: 'a',
    diagrams: [
      { id: 'a', file: 'a.html' },
      { id: 'b', file: 'b.html' },
      { id: 'y', file: 'y.html' },
    ],
    drilldowns: [
      { parent: 'a', component: 'queue', child: 'y' },
      { parent: 'b', component: 'queue', child: 'y' },
    ],
  };
}

function validComponents() {
  return [{ id: 'placeholder', globs: [] }];
}

test('validateOwnershipSubset resolves the correct parent via parent.map when component ids collide', () => {
  const manifest = collidingComponentManifest();
  const sidecar = {
    schema_version: 1, kind: 'ownership', map: 'y.json',
    parent: { map: 'b.json', component: 'queue' },
    components: validComponents(),
  };
  const failures = validateOwnershipSubset(manifest, sidecar, null, FAKE_BUNDLE_DIR, { sidecarPath: sidecarPathFor('y') });
  assert.deepEqual(failures, []);
});

test('validateOwnershipSubset rejects a parent.map that does not name any drilldown parent for the component', () => {
  const manifest = collidingComponentManifest();
  const sidecar = {
    schema_version: 1, kind: 'ownership', map: 'y.json',
    parent: { map: 'nowhere.json', component: 'queue' },
    components: validComponents(),
  };
  const failures = validateOwnershipSubset(manifest, sidecar, null, FAKE_BUNDLE_DIR, { sidecarPath: sidecarPathFor('y') });
  assert.ok(
    failures.some((item) => item.includes('bundle/ownership-not-subset') && item.includes('does not name')),
    failures.join('\n'),
  );
});

test('validateOwnershipSubset rejects a parent link missing map before ever reaching the ambiguity logic', () => {
  // ownership.schema.json:18 requires `parent.map` whenever `parent` is present, so a sidecar
  // missing it now fails schema validation — and, per item 3, a schema failure returns
  // immediately — before the (now effectively unreachable through any schema-valid sidecar)
  // "ambiguous, no map" branch further down ever runs. This supersedes the old expectation that
  // such a sidecar's failure message would mention "ambiguous".
  const manifest = collidingComponentManifest();
  const sidecar = {
    schema_version: 1, kind: 'ownership', map: 'y.json',
    parent: { component: 'queue' },
    components: validComponents(),
  };
  delete sidecar.parent.map; // still missing; explicit for readability
  const failures = validateOwnershipSubset(manifest, sidecar, null, FAKE_BUNDLE_DIR, { sidecarPath: sidecarPathFor('y') });
  assert.ok(
    failures.some((item) => item.includes('bundle/ownership-not-subset') && item.includes('schema')),
    failures.join('\n'),
  );
});

test('validateOwnershipSubset rejects a sidecar whose declared map does not match its own file identity', () => {
  // Regression for the original bug: identity used to come from the sidecar's own declared `map`
  // field, so a sidecar named x.ownership.json could simply *say* map:"y.json" and be validated as
  // if it were y. Identity must come from the file actually read (x.ownership.json -> x.json),
  // matched against manifest.diagrams[]; a self-map that disagrees with that identity is rejected
  // independent of whatever parent link it also declares — here a parent link that is otherwise
  // perfectly legitimate (b really is a drilldown parent of a "queue" component, just not x's).
  const manifest = {
    entry: 'a',
    diagrams: [
      { id: 'a', file: 'a.html' },
      { id: 'b', file: 'b.html' },
      { id: 'x', file: 'x.html' },
      { id: 'y', file: 'y.html' },
    ],
    drilldowns: [
      { parent: 'a', component: 'queue', child: 'x' },
      { parent: 'b', component: 'queue', child: 'y' },
    ],
  };
  const sidecar = {
    schema_version: 1, kind: 'ownership', map: 'y.json',
    parent: { map: 'b.json', component: 'queue' },
    components: validComponents(),
  };
  const failures = validateOwnershipSubset(manifest, sidecar, null, FAKE_BUNDLE_DIR, { sidecarPath: sidecarPathFor('x') });
  assert.ok(
    failures.some((item) => item.includes('bundle/ownership-not-subset') && item.includes('own diagram spec')),
    failures.join('\n'),
  );
});

test('validateBundle guards against an ownership child_map cycle instead of recursing forever', () => {
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
      ],
    };
    const payments = {
      schema_version: 1, kind: 'ownership', map: 'payments.json',
      parent: { map: 'checkout-platform.json', component: 'payments' },
      components: [
        { id: 'api', globs: ['src/payments/api/**'] },
        { id: 'risk', globs: ['src/payments/risk/**'] },
        { id: 'ledger', globs: ['src/payments/ledger/**'] },
        { id: 'psp', globs: ['src/payments/psp/**'], child_map: 'settlement.json' },
      ],
    };
    const settlement = {
      schema_version: 1, kind: 'ownership', map: 'settlement.json',
      parent: { map: 'payments.json', component: 'psp' },
      components: [
        // A hostile/broken sidecar pointing a grandchild's child_map back at an ancestor.
        { id: 'acquirer', globs: ['src/payments/psp/**'], child_map: 'checkout-platform.json' },
        { id: 'clearing', globs: ['src/payments/psp/**'] },
        { id: 'settle-ledger', globs: ['src/payments/psp/**'] },
      ],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), `${JSON.stringify(payments)}\n`);
    fs.writeFileSync(path.join(dir, 'settlement.ownership.json'), `${JSON.stringify(settlement)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expectFailure(dir, 'bundle/ownership-cycle');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle rejects a grandchild ownership sidecar bound to the wrong parent component', () => {
  // The recursive ownership walk (walkOwnershipTree) previously validated only the immediate
  // child's glob subset, never the child's own parent-binding claim — so a grandchild sidecar
  // that names the wrong component still passed with ok:true. Settlement's real parent link is
  // payments' "psp" component (payments.json's child_map for psp is settlement.json); this
  // sidecar instead claims "api" (a real but wrong component of the same parent diagram).
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
      ],
    };
    const payments = {
      schema_version: 1, kind: 'ownership', map: 'payments.json',
      parent: { map: 'checkout-platform.json', component: 'payments' },
      components: [
        { id: 'api', globs: ['src/payments/api/**'] },
        { id: 'risk', globs: ['src/payments/risk/**'] },
        { id: 'ledger', globs: ['src/payments/ledger/**'] },
        { id: 'psp', globs: ['src/payments/psp/**'], child_map: 'settlement.json' },
      ],
    };
    const settlement = {
      schema_version: 1, kind: 'ownership', map: 'settlement.json',
      parent: { map: 'payments.json', component: 'api' }, // wrong: should be "psp"
      components: [
        { id: 'acquirer', globs: ['src/payments/psp/acquirer/**'] },
        { id: 'clearing', globs: ['src/payments/psp/clearing/**'] },
        { id: 'settle-ledger', globs: ['src/payments/psp/settle-ledger/**'] },
      ],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), `${JSON.stringify(payments)}\n`);
    fs.writeFileSync(path.join(dir, 'settlement.ownership.json'), `${JSON.stringify(settlement)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, 'a wrong grandchild parent binding must fail --check, not pass ok:true');
    assert.ok(result.error instanceof BundleError);
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset')),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle rejects a grandchild reached via a second ownership path whose parent.map names the wrong file', () => {
  // The real edge in manifest.drilldowns is checkout-platform.queue -> ledger-flow, and
  // ledger-flow's own sidecar correctly declares that as its parent. But payments' sidecar ALSO
  // declares a component named "queue" (reusing the exact same component id from a different
  // parent diagram) whose child_map points at the very same ledger-flow.ownership.json. Reached
  // that second way, the pre-existing "parent.component matches the child_map pointer" check
  // cannot tell the two "queue" components apart (both are literally named "queue"), and
  // manifest.drilldowns genuinely does contain a "queue" edge whose child is ledger-flow — so
  // matching by (component, map) against the manifest ALONE (the pre-fix behavior) would accept
  // it. Only checking that parent.map names the FILE this sidecar was actually walked from
  // (payments.json, not checkout-platform.json) catches it. All globs are empty precisely so no
  // unrelated glob-subset failure could mask whether this specific check fired.
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: [], child_map: 'ledger-flow.json' },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
      ],
    };
    const payments = {
      schema_version: 1, kind: 'ownership', map: 'payments.json',
      parent: { map: 'checkout-platform.json', component: 'payments' },
      components: [
        { id: 'api', globs: ['src/payments/api/**'] },
        { id: 'risk', globs: ['src/payments/risk/**'] },
        { id: 'ledger', globs: ['src/payments/ledger/**'] },
        { id: 'psp', globs: ['src/payments/psp/**'] },
        // Decoy: a second, unrelated component that happens to reuse the id "queue" and also
        // points its child_map at ledger-flow.json.
        { id: 'queue', globs: [], child_map: 'ledger-flow.json' },
      ],
    };
    const ledgerFlow = {
      schema_version: 1, kind: 'ownership', map: 'ledger-flow.json',
      parent: { map: 'checkout-platform.json', component: 'queue' }, // its one true, correctly-declared parent
      components: [{ id: 'events', globs: [] }],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), `${JSON.stringify(payments)}\n`);
    fs.writeFileSync(path.join(dir, 'ledger-flow.ownership.json'), `${JSON.stringify(ledgerFlow)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, 'a grandchild reached via the wrong ownership path must fail --check, not pass ok:true');
    assert.ok(result.error instanceof BundleError);
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset') && String(item).includes('reached from')),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle reports a controlled failure instead of crashing when a child sidecar has a malformed component entry', () => {
  // Distinct from the "malformed child sidecar" test below (whole sidecar is a JSON null): here
  // the sidecar IS a valid object with a correctly-matching parent link, but `components` contains
  // a bare `null` entry. That used to reach validateChildOwnershipSubset's
  // `childComponents.flatMap((component) => component.globs || [])` in archify/locate/ownership.mjs
  // and throw a raw TypeError, because the pre-fix code kept going after recording the schema
  // failure instead of returning immediately.
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
      ],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    const payments = {
      schema_version: 1, kind: 'ownership', map: 'payments.json',
      parent: { map: 'checkout-platform.json', component: 'payments' },
      components: [null],
    };
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), `${JSON.stringify(payments)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, 'a malformed component entry must fail --check, not throw TypeError');
    assert.ok(result.error instanceof BundleError, `expected BundleError, got ${result.error?.constructor?.name}: ${result.error?.message}`);
    assert.equal(result.error.code, 'bundle/invalid');
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset')),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle rejects a root ownership sidecar that parses to a JSON literal null', () => {
  // Distinct from the malformed-CHILD-sidecar test below: here the sidecar manifest.ownership
  // points at directly (the bundle's root/entry sidecar) is itself a literal `null`. The pre-fix
  // code's `if (!sidecar) return;` swallowed this with no failure recorded at all — a later,
  // supposedly-redundant object-shape check existed further down but was unreachable dead code,
  // since the early return above it already exited first.
  const dir = stageDeep();
  try {
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), 'null\n');
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expectFailure(dir, 'bundle/ownership-parse');
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle reports a controlled failure instead of crashing on a malformed child sidecar', () => {
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'], child_map: 'payments.json' },
      ],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    // A malformed child sidecar: valid JSON, but not an object (a bare `null`), which used to
    // reach `current.components` inside walkOwnershipTree and throw a TypeError.
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), 'null\n');
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expectFailure(dir, 'bundle/ownership-parse');
  } finally {
    disposeBundleFixture(dir);
  }
});

// --- Tur 4 (astra-4 RET: 3 açık madde, hepsi kök sidecar'da) ---------------------------------

test('validateBundle rejects a root ownership sidecar whose own map names a different (but real) diagram than the entry', () => {
  // Tur-3's deviation was wrong: the root's identity is the ENTRY's own spec, full stop — not
  // whatever the root sidecar's own `map` declares (that would let manifest.ownership.file's
  // schema/sha256/existence checks stand in for actually being the entry's ownership data, which
  // they don't prove). Here checkout-platform.ownership.json (correctly named, correctly bound by
  // manifest.ownership.file) declares map:"payments.json" — a real diagram, just not the entry's.
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'payments.json', // wrong: entry's own spec is checkout-platform.json
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'] },
      ],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, 'a root sidecar whose map names a different diagram than the entry must fail --check');
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset') && String(item).includes('own diagram spec')),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test("validateBundle rejects a root sidecar's declared parent sibling whose own map is self-mislabeled", () => {
  // The root's OWN parent/map declarations are checked against the sibling loadSiblingSidecar
  // finds on disk (checkout-platform.ownership.json declares parent.map:"payments.json", and
  // payments.ownership.json exists) — but until now nothing checked that the LOADED sibling file's
  // own `map` field actually resolves to what its filename implies. Here payments.ownership.json
  // exists at the expected path but its own map says "ledger-flow.json", not "payments.json".
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      parent: { map: 'payments.json', component: 'psp' },
      components: [
        { id: 'buyers', globs: ['src/buyers/**'] },
        { id: 'edge', globs: ['src/edge/**'] },
        { id: 'checkout', globs: ['src/checkout/**'] },
        { id: 'fraud', globs: ['src/fraud/**'] },
        { id: 'orders', globs: ['src/orders/**'] },
        { id: 'queue', globs: ['src/queue/**'] },
        { id: 'worker', globs: ['src/worker/**'] },
        { id: 'payments', globs: ['src/payments/**'] },
      ],
    };
    const payments = {
      schema_version: 1, kind: 'ownership', map: 'ledger-flow.json', // wrong: its own identity is payments.json
      components: [{ id: 'api', globs: ['src/payments/api/**'] }],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    fs.writeFileSync(path.join(dir, 'payments.ownership.json'), `${JSON.stringify(payments)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, "a self-mislabeled parent sibling's map must fail --check");
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset') && String(item).includes("own map")),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('validateBundle reports a controlled failure instead of crashing when the ROOT sidecar has a malformed component entry', () => {
  // Distinct from the earlier CHILD-malformed-component test: here the schema-invalid components
  // entry is on the ROOT sidecar itself. Before this fix, a schema failure was recorded but the
  // walk still started on the root's own (untrustworthy) `components[]`, reaching `component.id`
  // on a bare `null` and throwing a raw TypeError instead of a controlled BundleError.
  const dir = stageDeep();
  try {
    const checkoutPlatform = {
      schema_version: 1, kind: 'ownership', map: 'checkout-platform.json',
      components: [null],
    };
    fs.writeFileSync(path.join(dir, 'checkout-platform.ownership.json'), `${JSON.stringify(checkoutPlatform)}\n`);
    const bytes = fs.readFileSync(path.join(dir, 'checkout-platform.ownership.json'));
    patchManifest(dir, (manifest) => {
      manifest.ownership = {
        file: 'checkout-platform.ownership.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    const result = (() => {
      try {
        return { ok: true, value: validateBundle(dir) };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    assert.equal(result.ok, false, 'a malformed root component entry must fail --check, not throw TypeError');
    assert.ok(result.error instanceof BundleError, `expected BundleError, got ${result.error?.constructor?.name}: ${result.error?.message}`);
    assert.equal(result.error.code, 'bundle/invalid');
    assert.ok(
      (result.error.details.failures || []).some((item) => String(item).includes('bundle/ownership-not-subset')),
      JSON.stringify(result.error.details.failures),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('buildBundleManifest rejects a→b→c plus a direct a→c triangle at build time (bundle/drilldown-shared)', () => {
  // Regression for astra-4 item 5: buildTree-level coverage of this exact triangle already existed
  // (see the two direct buildTree tests below), and validateBundle-level coverage already existed
  // (the earlier "two rows target the same child" test, via a manifest patched AFTER a successful
  // build) — but nothing exercised the triangle at buildBundleManifest/`archify bundle` build time,
  // where the failure has to surface before manifest.json is ever written. checkout-platform's real
  // chain is checkout-platform(a) -> payments(b) -> settlement(c) (via payments' "psp" component);
  // adding a second, direct drilldown from checkout-platform's "fraud" component straight to
  // "settlement" makes c reachable two ways — once at level 1 (direct), once at level 2 (via b).
  const dir = stageDeep();
  try {
    const specPath = path.join(dir, 'checkout-platform.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const fraud = spec.components.find((item) => item.id === 'fraud');
    assert.ok(fraud, 'fixture must still have a "fraud" component to attach the extra drilldown to');
    fraud.drilldown = 'settlement';
    fs.writeFileSync(specPath, JSON.stringify(spec));
    assert.throws(
      () => buildBundleManifest(dir),
      (error) => error instanceof BundleError
        && error.code === 'bundle/invalid'
        && (error.details.failures || []).some((item) => String(item).includes('bundle/drilldown-shared: settlement')),
    );
  } finally {
    disposeBundleFixture(dir);
  }
});

test('buildTree flags a diagram reached both directly and through an intermediate as shared, at the first-discovered level', () => {
  // a -> b -> c and a -> c directly: c is reached twice (once via b at level 2, once direct at
  // level 1, depending on row order — here b's row is listed first so c is first discovered via
  // b at level 2). The graph is invalid regardless of which level wins; this only pins that
  // buildTree's DFS records SOME definite level for the first discovery and still flags the
  // duplicate, rather than silently keeping one path and dropping the other.
  const diagramIds = new Set(['a', 'b', 'c']);
  const drilldowns = [
    { parent: 'a', component: 'toB', child: 'b' },
    { parent: 'b', component: 'toC', child: 'c' },
    { parent: 'a', component: 'toC', child: 'c' },
  ];
  const tree = buildTree({ entryId: 'a', diagramIds, drilldowns });
  assert.equal(tree.level.get('c'), 2);
  assert.deepEqual(tree.shared, ['c']);
});

test('buildTree walks a 10,000-node chain iteratively without a RangeError and halts past the 8-level cap', () => {
  const ids = ['n0'];
  const drilldowns = [];
  for (let index = 1; index < 10000; index += 1) {
    ids.push(`n${index}`);
    drilldowns.push({ parent: `n${index - 1}`, component: `c${index}`, child: `n${index}` });
  }
  const diagramIds = new Set(ids);
  const tree = buildTree({ entryId: 'n0', diagramIds, drilldowns });
  assert.ok(tree.maxObservedLevel > 7, `expected maxObservedLevel > 7, got ${tree.maxObservedLevel}`);
  assert.equal(tree.cycle.length, 0);
  assert.equal(tree.shared.length, 0);
  // Levels within the cap are still computed correctly for every reachable diagram.
  for (let index = 0; index <= 7; index += 1) assert.equal(tree.level.get(`n${index}`), index);
});

test('buildTree accepts a legitimate 8-level chain (levels 0..7) without flagging depth-exceeded', () => {
  const ids = Array.from({ length: 8 }, (_, index) => `n${index}`);
  const drilldowns = ids.slice(1).map((id, index) => ({ parent: `n${index}`, component: `c${index}`, child: id }));
  const diagramIds = new Set(ids);
  const tree = buildTree({ entryId: 'n0', diagramIds, drilldowns });
  assert.equal(tree.maxObservedLevel, 7);
  assert.equal(tree.orphans.length, 0);
  for (let index = 0; index < 8; index += 1) assert.equal(tree.level.get(`n${index}`), index);
});
