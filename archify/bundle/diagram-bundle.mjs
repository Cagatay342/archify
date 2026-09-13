import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultOwnershipPath, validateChildOwnershipSubset } from '../locate/ownership.mjs';
import { SEMANTIC_COLLECTIONS } from '../renderers/shared/cli.mjs';
import { validateSchema } from '../renderers/shared/validator.mjs';
import { bundle as validateBundleSchema } from '../renderers/shared/generated-validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

const HTML_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const OWNERSHIP_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.ownership\.json$/;
const DIAGRAM_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MANIFEST_SCRIPT_RE = /<script id="archify-bundle-manifest" type="application\/json">[\s\S]*?<\/script>\n?/;

export class BundleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BundleError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new BundleError(code, message, details);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readBytes(file) {
  return fs.readFileSync(file);
}

export function serializeBundleManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')}\n`;
}

export function stripBundleManifest(html) {
  return html.replace(MANIFEST_SCRIPT_RE, '');
}

export function extractBundleManifestText(html) {
  const match = html.match(/<script id="archify-bundle-manifest" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? match[1] : null;
}

export function injectBundleManifest(html, manifestText) {
  const stripped = stripBundleManifest(html);
  const index = stripped.lastIndexOf('</body>');
  if (index < 0) fail('bundle/invalid', 'Entry HTML is missing </body> for manifest embed.', { failures: ['bundle/embed-missing'] });
  const script = `<script id="archify-bundle-manifest" type="application/json">${manifestText}</script>\n`;
  return `${stripped.slice(0, index)}${script}${stripped.slice(index)}`;
}

export function htmlArtifactSha256(fileBytes) {
  const text = fileBytes.toString('utf8');
  if (!text.includes('id="archify-bundle-manifest"')) return sha256Bytes(fileBytes);
  return sha256Bytes(Buffer.from(stripBundleManifest(text), 'utf8'));
}

function writeAtomic(target, contents) {
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, target);
}

function semanticItems(diagram) {
  const collection = SEMANTIC_COLLECTIONS[diagram?.diagram_type];
  return collection && Array.isArray(diagram[collection]) ? diagram[collection] : [];
}

function svgOpenTag(html) {
  return html.match(/<svg\b[^>]*>/)?.[0] || '';
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '';
}

function ownershipSchemaFailures(sidecar, label) {
  try {
    validateSchema('ownership', sidecar);
    return [];
  } catch (error) {
    if (String(error.message || '').includes('unknown diagram type "ownership"')) {
      // TODO(locate): switch to validateSchema('ownership')
      if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar) || !Array.isArray(sidecar.components)) {
        return [`bundle/ownership-not-subset: ${label} components must be an array of { id, globs }`];
      }
      return [];
    }
    return [`bundle/ownership-not-subset: ${label} failed ownership schema`];
  }
}

// A sidecar's true identity (which diagram it belongs to) is the diagram whose spec file its own
// filename derives to (x.ownership.json -> x.json), matched against manifest.diagrams[].file —
// never taken from the sidecar's own `map` declaration, which is exactly the value under test
// whenever a `parent`/self `map` field is checked below.
function ownershipSpecPath(sidecarPath) {
  const base = path.basename(sidecarPath).replace(/\.ownership\.json$/i, '.json');
  return path.resolve(path.dirname(sidecarPath), base);
}

function diagramIdForSpecPath(manifest, bundleDir, specPath) {
  const diagrams = Array.isArray(manifest?.diagrams) ? manifest.diagrams : [];
  const found = diagrams.find((diagram) => diagram?.file
    && path.resolve(bundleDir, String(diagram.file).replace(/\.html$/i, '.json')) === specPath);
  return found ? found.id : null;
}

export function validateOwnershipSubset(manifest, sidecar, parentSidecar, bundleDir, {
  sidecarPath, parentSidecarPath, ownSpecPath: expectedSpecPath, parentSpecPath: expectedParentSpecPath,
} = {}) {
  const failures = [
    ...ownershipSchemaFailures(sidecar, 'child sidecar'),
    ...(parentSidecar ? ownershipSchemaFailures(parentSidecar, 'parent sidecar') : []),
  ];
  // A schema failure means components[].globs / parent.* cannot be trusted below — walking into
  // the subset/glob logic on malformed data (e.g. components:[null]) is what used to throw a raw
  // TypeError out of validateChildOwnershipSubset instead of a controlled BundleError. Stop here.
  if (failures.length) return failures;

  if (!sidecarPath) throw new TypeError('validateOwnershipSubset: sidecarPath is required');

  // Identity is the diagram this sidecar is expected to describe. For a child reached by walking
  // a component.child_map pointer, that expectation IS the pointer's own target spec, passed in
  // explicitly as `ownSpecPath` by the walk (see validateBundle's ownership check) — checking the
  // sidecar's own `map` against that pointer is what catches a sidecar smuggled in under a false
  // identity. Only when the caller has no such pointer to check against (the bundle's root sidecar,
  // whose file can be bound under any name via manifest.ownership.file, or a pure declarative call
  // with no real walk) do we fall back to the file's own naming convention
  // (`x.ownership.json` -> `x.json`, matched against manifest.diagrams[].file).
  const ownSpecPath = expectedSpecPath || ownershipSpecPath(sidecarPath);
  const ownId = diagramIdForSpecPath(manifest, bundleDir, ownSpecPath);
  const declaredMapPath = sidecar?.map ? path.resolve(path.dirname(sidecarPath), String(sidecar.map)) : null;
  if (!ownId) {
    failures.push(`bundle/ownership-not-subset: ${path.basename(sidecarPath)} does not correspond to any diagram in manifest.diagrams[]`);
  } else if (declaredMapPath !== ownSpecPath) {
    failures.push(`bundle/ownership-not-subset: map ${JSON.stringify(sidecar?.map)} does not resolve to ${path.basename(sidecarPath)}'s own diagram spec`);
  }

  const parentLink = sidecar?.parent;
  if (parentLink && typeof parentLink === 'object') {
    const drills = Array.isArray(manifest?.drilldowns) ? manifest.drilldowns : [];
    const declaredParentMapPath = parentLink.map ? path.resolve(path.dirname(sidecarPath), String(parentLink.map)) : null;

    if (parentSidecarPath) {
      // Real-walk binding: this sidecar was reached by walking parentSidecarPath's child_map, so
      // parent.map must name THAT exact file's diagram — not merely any diagram manifest.drilldowns
      // recognizes as *a* valid parent for this component elsewhere in the bundle — and the
      // (parent, component, child) triple it implies must be a real manifest.drilldowns edge. The
      // parent's expected identity is supplied by the caller (it already had to compute it to walk
      // here at all — the root's is manifest.entry, a deeper one's is its own ownSpecPath from the
      // level above), falling back to the parent file's own naming convention only when the caller
      // has nothing more specific to offer.
      const parentSpecPath = expectedParentSpecPath || ownershipSpecPath(parentSidecarPath);
      const realParentId = diagramIdForSpecPath(manifest, bundleDir, parentSpecPath);
      if (!realParentId) {
        failures.push(`bundle/ownership-not-subset: ${path.basename(parentSidecarPath)} does not correspond to any diagram in manifest.diagrams[]`);
      } else {
        // The loaded parent sidecar's OWN `map` must also resolve to that same identity — being
        // found at the expected path/by the expected pointer is not enough on its own; the file's
        // own self-declaration has to agree too, the same way a walked child's is checked against
        // the pointer that named it. This matters specifically for the sidecar loadSiblingSidecar
        // loads for the bundle's root (never independently validated as a "child" elsewhere, since
        // it isn't reached via a child_map walk) — a mismatch here used to pass silently.
        if (parentSidecar) {
          const parentDeclaredMapPath = parentSidecar?.map
            ? path.resolve(path.dirname(parentSidecarPath), String(parentSidecar.map))
            : null;
          if (parentDeclaredMapPath !== parentSpecPath) {
            failures.push(`bundle/ownership-not-subset: ${path.basename(parentSidecarPath)}'s own map ${JSON.stringify(parentSidecar?.map)} does not resolve to its expected diagram spec`);
          }
        }
        if (declaredParentMapPath !== parentSpecPath) {
          failures.push(`bundle/ownership-not-subset: parent.map ${JSON.stringify(parentLink.map)} does not name the diagram this sidecar was reached from (${path.basename(parentSidecarPath)})`);
        } else if (ownId && !drills.some((row) => row.parent === realParentId && row.component === parentLink.component && row.child === ownId)) {
          failures.push(`bundle/ownership-not-subset: (${realParentId}, ${JSON.stringify(parentLink.component)}, ${ownId}) is not a drilldown edge in manifest.drilldowns`);
        }
      }
    } else {
      // No real walk to check against (validating a sidecar's declared parent in isolation, e.g.
      // the bundle's root sidecar with no sibling file on disk) — fall back to matching
      // manifest.drilldowns by (component, map), still keyed off the file-derived ownId rather
      // than a declared one.
      let candidates = drills.filter((item) => item.component === parentLink.component);
      if (ownId) candidates = candidates.filter((item) => item.child === ownId);
      if (!candidates.length) {
        failures.push(`bundle/ownership-not-subset: parent.component ${JSON.stringify(parentLink.component)} is not a drilldown targeting ${ownId ? JSON.stringify(ownId) : 'this diagram'}`);
      } else if (parentLink.map) {
        const matched = candidates.some((item) => {
          const parentDiagram = (manifest.diagrams || []).find((diagram) => diagram.id === item.parent);
          if (!parentDiagram) return false;
          const expectedFile = parentDiagram.file.replace(/\.html$/, '.json');
          return path.resolve(bundleDir, expectedFile) === declaredParentMapPath;
        });
        if (!matched) {
          failures.push(`bundle/ownership-not-subset: parent.map ${JSON.stringify(parentLink.map)} does not name the spec of the drilldown parent for ${JSON.stringify(parentLink.component)}`);
        }
      } else if (candidates.length > 1) {
        failures.push(`bundle/ownership-not-subset: parent.component ${JSON.stringify(parentLink.component)} is ambiguous across ${candidates.map((item) => item.parent).join(', ')}; set parent.map`);
      }
    }

    if (parentSidecar) {
      for (const failure of validateChildOwnershipSubset(
        parentSidecar,
        parentLink.component,
        sidecar,
        'bundle/ownership-not-subset',
      )) {
        failures.push(`${failure.code}: ${failure.message}`);
      }
    }
  }
  return failures;
}

function scanPairs(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail('bundle/invalid', `Bundle directory not found: ${dir}`, { failures: ['bundle/dir-missing'], subject: { dir } });
  }
  const names = fs.readdirSync(dir);
  const pairs = [];
  for (const file of names) {
    if (!HTML_FILE.test(file)) continue;
    const id = file.slice(0, -'.html'.length);
    if (!DIAGRAM_ID.test(id)) {
      fail('bundle/invalid', `Diagram file ${file} does not yield a valid diagram id.`, {
        failures: [`bundle/id-invalid: ${file}`],
        subject: { file },
      });
    }
    const specFile = `${id}.json`;
    const specPath = path.join(dir, specFile);
    const htmlPath = path.join(dir, file);
    if (!fs.existsSync(specPath)) {
      fail('bundle/invalid', `HTML ${file} has no same-name JSON spec.`, {
        failures: [`bundle/spec-missing: ${specFile}`],
        subject: { file },
      });
    }
    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    } catch (error) {
      fail('bundle/invalid', `Could not parse ${specFile}: ${error.message}`, {
        failures: [`bundle/spec-parse: ${specFile}`],
        subject: { file: specFile },
      });
    }
    pairs.push({
      id,
      file,
      specFile,
      htmlPath,
      specPath,
      spec,
      specBytes: readBytes(specPath),
    });
  }
  if (!pairs.length) {
    fail('bundle/invalid', 'Bundle directory contains no HTML + same-name JSON pairs.', {
      failures: ['bundle/empty'],
      subject: { dir },
    });
  }
  return pairs;
}

// The schema caps `diagrams[].level` at 7 (an 8-level bundle), so nothing legitimate is ever
// deeper than this. Halting expansion here — rather than only checking maxObservedLevel after
// the fact — is what keeps a pathological or hostile manifest (thousands of chained rows) from
// blowing the call stack before validation ever gets a chance to reject it.
const TREE_DEPTH_HALT = 7;

// Depth-first over `drilldowns[]`, walked with an explicit stack instead of native recursion so
// a long chain (thousands of diagrams) cannot overflow the call stack. `color` mirrors the
// classic white/gray/black DFS coloring: 1 = open (an ancestor on the current path, so a row
// that targets it is a cycle), 2 = closed (already fully explored elsewhere, so a second row
// that targets it means the diagram is shared by more than one parent).
export function buildTree({ entryId, diagramIds, drilldowns }) {
  const childrenOf = new Map();
  for (const row of drilldowns) {
    if (!childrenOf.has(row.parent)) childrenOf.set(row.parent, []);
    childrenOf.get(row.parent).push(row);
  }
  const level = new Map();
  const color = new Map();
  const cycle = new Set();
  const shared = new Set();
  if (diagramIds.has(entryId)) {
    color.set(entryId, 1);
    level.set(entryId, 0);
    const stack = [{ id: entryId, depth: 0, rows: childrenOf.get(entryId) || [], index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.rows.length) {
        color.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const row = frame.rows[frame.index];
      frame.index += 1;
      const child = row.child;
      if (!diagramIds.has(child)) continue;
      const state = color.get(child);
      if (state === 1) {
        cycle.add(child);
        continue;
      }
      if (state === 2) {
        shared.add(child);
        continue;
      }
      if (frame.depth >= TREE_DEPTH_HALT) {
        // One level past the cap: record it so maxObservedLevel reports depth-exceeded, but
        // never push a frame for it — that is the bound that keeps the stack finite.
        level.set(child, frame.depth + 1);
        color.set(child, 2);
        continue;
      }
      color.set(child, 1);
      level.set(child, frame.depth + 1);
      stack.push({ id: child, depth: frame.depth + 1, rows: childrenOf.get(child) || [], index: 0 });
    }
  }
  const orphans = [...diagramIds].filter((id) => id !== entryId && !level.has(id));
  const maxObservedLevel = level.size ? Math.max(...level.values()) : 0;
  return { level, cycle: [...cycle], shared: [...shared], orphans, maxObservedLevel };
}

function chooseEntry(pairs) {
  const targets = new Set();
  const withDrilldown = new Set();
  for (const pair of pairs) {
    for (const item of semanticItems(pair.spec)) {
      if (item.drilldown) {
        targets.add(item.drilldown);
        withDrilldown.add(pair.id);
      }
    }
  }
  const roots = [...withDrilldown].filter((id) => !targets.has(id));
  if (roots.length === 1) return roots[0];
  if (pairs.length === 1) return pairs[0].id;
  fail('bundle/invalid', 'Could not determine a unique entry diagram from components[].drilldown.', {
    failures: ['bundle/entry-ambiguous'],
    supportedFixes: ['give exactly one parent diagram drilldown fields that point at the others'],
  });
}

export function bundleRendererEnv(cwd = process.cwd(), env = process.env) {
  const inherited = env.ARCHIFY_REPO_ROOT;
  if (inherited) return { ...env, ARCHIFY_REPO_ROOT: inherited };
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  const top = result.status === 0 ? result.stdout.trim() : '';
  return top ? { ...env, ARCHIFY_REPO_ROOT: top } : { ...env };
}

function chooseOwnershipFile(dir, entryId) {
  const preferred = `${entryId}.ownership.json`;
  if (fs.existsSync(path.join(dir, preferred))) return preferred;
  const names = fs.readdirSync(dir).filter((name) => OWNERSHIP_FILE.test(name));
  if (!names.length) return null;
  fail('bundle/invalid', `Ownership sidecar ${preferred} is missing.`, {
    failures: [`bundle/ownership-missing: ${preferred}`],
    subject: { file: preferred },
  });
}

function renderWithBundleFlags(pair, role, specSha) {
  const type = pair.spec.diagram_type;
  const renderer = path.join(skillRoot, 'renderers', type, `render-${type}.mjs`);
  if (!fs.existsSync(renderer)) {
    fail('bundle/invalid', `No renderer for diagram type ${JSON.stringify(type)}.`, {
      failures: [`bundle/type-unknown: ${type}`],
      subject: { id: pair.id },
    });
  }
  const result = spawnSync(process.execPath, [
    renderer,
    pair.specPath,
    pair.htmlPath,
    '--bundle-id', pair.id,
    '--bundle-role', role,
    '--bundle-spec-sha256', specSha,
  ], {
    cwd: skillRoot,
    encoding: 'utf8',
    env: bundleRendererEnv(),
  });
  if (result.status !== 0) {
    fail('bundle/invalid', `Renderer failed for ${pair.file}: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`, {
      failures: [`bundle/render-failed: ${pair.id}`],
      subject: { id: pair.id, file: pair.file },
    });
  }
}

function drilldownsFrom(pairs, entryId) {
  const entryPair = pairs.find((pair) => pair.id === entryId);
  const others = pairs
    .filter((pair) => pair.id !== entryId)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const ordered = entryPair ? [entryPair, ...others] : others;
  const rows = [];
  for (const pair of ordered) {
    const seen = new Set();
    for (const item of semanticItems(pair.spec)) {
      if (!item.drilldown) continue;
      if (seen.has(item.id)) {
        fail('bundle/invalid', `Component ${item.id} declares more than one drilldown.`, {
          failures: [`bundle/drilldown-duplicate: ${item.id}`],
        });
      }
      seen.add(item.id);
      rows.push({
        parent: pair.id,
        component: item.id,
        child: item.drilldown,
        ...(item.label ? { label: String(item.label).slice(0, 80) } : {}),
      });
    }
  }
  return rows;
}

export function buildBundleManifest(dir) {
  const resolved = path.resolve(dir);
  const pairs = scanPairs(resolved);
  const entryId = chooseEntry(pairs);
  const byId = new Map(pairs.map((pair) => [pair.id, pair]));
  if (!byId.has(entryId)) {
    fail('bundle/invalid', `Entry ${entryId} is missing from the directory.`, { failures: ['bundle/entry-missing'] });
  }

  for (const pair of pairs) {
    pair.specSha = sha256Bytes(pair.specBytes);
    const role = pair.id === entryId ? 'entry' : 'child';
    renderWithBundleFlags(pair, role, pair.specSha);
    pair.htmlBytes = readBytes(pair.htmlPath);
    pair.artifactSha = htmlArtifactSha256(pair.htmlBytes);
  }

  const entry = byId.get(entryId);
  const drilldowns = drilldownsFrom(pairs, entryId);
  const diagramIds = new Set(pairs.map((pair) => pair.id));
  const tree = buildTree({ entryId, diagramIds, drilldowns });
  if (tree.cycle.length) {
    fail('bundle/invalid', `Drilldown graph has a cycle at ${tree.cycle.join(', ')}.`, {
      failures: tree.cycle.map((id) => `bundle/drilldown-cycle: ${id}`),
    });
  }
  if (tree.shared.length) {
    fail('bundle/invalid', `Diagram(s) ${tree.shared.join(', ')} are targeted by more than one drilldown row.`, {
      failures: tree.shared.map((id) => `bundle/drilldown-shared: ${id}`),
    });
  }
  if (tree.orphans.length) {
    fail('bundle/invalid', `Diagram(s) ${tree.orphans.join(', ')} are not reachable from the entry.`, {
      failures: tree.orphans.map((id) => `bundle/orphan: ${id}`),
    });
  }
  if (tree.maxObservedLevel > 7) {
    fail('bundle/invalid', 'Bundle drilldown tree exceeds the 8-level depth cap.', {
      failures: ['bundle/depth-exceeded'],
    });
  }
  const maxDepth = Math.max(2, tree.maxObservedLevel + 1);
  const diagrams = pairs
    .slice()
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((pair) => ({
      id: pair.id,
      file: pair.file,
      diagram_type: pair.spec.diagram_type,
      title: pair.spec.meta?.title || pair.id,
      level: tree.level.get(pair.id) ?? 0,
      node_count: semanticItems(pair.spec).length,
      spec_sha256: pair.specSha,
      artifact_sha256: pair.artifactSha,
    }));

  const manifest = {
    schema_version: 1,
    bundle_type: 'drilldown',
    entry: entryId,
    max_depth: maxDepth,
    diagrams,
    drilldowns,
  };

  const ownershipFile = chooseOwnershipFile(resolved, entryId);
  if (ownershipFile) {
    manifest.ownership = {
      file: ownershipFile,
      sha256: sha256Bytes(readBytes(path.join(resolved, ownershipFile))),
    };
  }

  const manifestText = serializeBundleManifest(manifest);
  const manifestPath = path.join(resolved, 'manifest.json');
  writeAtomic(manifestPath, manifestText);

  const entryHtml = injectBundleManifest(fs.readFileSync(entry.htmlPath, 'utf8'), manifestText);
  writeAtomic(entry.htmlPath, entryHtml);

  return {
    ok: true,
    command: 'bundle',
    dir: resolved,
    manifest,
    manifestPath,
  };
}

function loadSiblingSidecar(dir, sidecar) {
  const map = sidecar?.parent?.map;
  if (!map) return null;
  // Resolve the full declared path (not just its basename) so "nested/a.json" is never confused
  // with a same-named "a.json" elsewhere, and return the path we actually loaded from — the
  // caller needs it to validate the root sidecar's own parent link against the real file, the
  // same way a walked child's parent link is validated against the sidecar it was reached from.
  const candidate = defaultOwnershipPath(path.resolve(dir, String(map)));
  if (!fs.existsSync(candidate)) return null;
  try {
    return { data: JSON.parse(fs.readFileSync(candidate, 'utf8')), path: candidate };
  } catch {
    return null;
  }
}

function checkSummary(checks) {
  return {
    checksPassed: checks.filter((item) => item.ok).length,
    checkCount: checks.length,
  };
}

export function validateBundle(dir) {
  const resolved = path.resolve(dir);
  const failures = [];
  const checks = [];
  const note = (message) => { failures.push(message); };
  const record = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); };
  const runCheck = (name, fn) => {
    const before = failures.length;
    fn();
    record(name, failures.length === before);
  };
  const abort = (message, extra = {}) => {
    fail('bundle/invalid', message, {
      supportedFixes: extra.supportedFixes || ['run archify bundle <dir> to refresh the manifest'],
      ...checkSummary(checks),
      ...extra,
      failures: extra.failures || failures,
    });
  };

  const manifestPath = path.join(resolved, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    record('manifest', false);
    abort('manifest.json is missing.', {
      failures: ['bundle/manifest-missing'],
      subject: { dir: resolved },
    });
  }
  const manifestBytes = readBytes(manifestPath);
  const manifestText = manifestBytes.toString('utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    record('manifest', false);
    abort(`manifest.json is not valid JSON: ${error.message}`, {
      failures: ['bundle/manifest-parse'],
    });
  }

  if (!validateBundleSchema(manifest)) {
    const first = validateBundleSchema.errors?.[0];
    record('manifest', false);
    abort('Diagram bundle failed validation: bundle/schema.', {
      failures: [`bundle/schema: ${first?.instancePath || '/'} ${first?.message || 'failed schema'}`],
    });
  }
  record('manifest', true);

  const diagrams = (Array.isArray(manifest.diagrams) ? manifest.diagrams : [])
    .filter((item) => HTML_FILE.test(item.file || ''));
  const entry = diagrams.find((item) => item.id === manifest.entry);
  const ids = diagrams.map((item) => item.id);
  const diagramIds = new Set(ids);
  const drills = Array.isArray(manifest.drilldowns) ? manifest.drilldowns : [];
  const tree = buildTree({ entryId: manifest.entry, diagramIds, drilldowns: drills });
  runCheck('levels', () => {
    if (!entry || entry.level !== 0) note('bundle/entry-level: entry must exist in diagrams[] at level 0');
    if (tree.maxObservedLevel > 7) {
      note('bundle/depth-exceeded: bundle exceeds the 8-level cap');
    } else {
      for (const diagram of diagrams) {
        if (!tree.level.has(diagram.id)) continue;
        const expectedLevel = tree.level.get(diagram.id);
        if (diagram.level !== expectedLevel) {
          note(`bundle/child-level: ${diagram.id} level ${diagram.level} does not match the computed depth ${expectedLevel}`);
        }
      }
      const expectedMaxDepth = Math.max(2, tree.maxObservedLevel + 1);
      if (manifest.max_depth !== expectedMaxDepth) {
        note(`bundle/max-depth: max_depth ${manifest.max_depth} does not match the computed ${expectedMaxDepth}`);
      }
    }
  });

  const files = diagrams.map((item) => item.file);
  runCheck('files', () => {
    if (new Set(ids).size !== ids.length) note('bundle/duplicate-id: diagrams[].id must be unique');
    if (new Set(files).size !== files.length) note('bundle/duplicate-file: diagrams[].file must be unique');
    for (const diagram of diagrams) {
      if (!HTML_FILE.test(diagram.file || '')) {
        note(`bundle/file-path: ${diagram.file} must be a same-directory HTML filename`);
        continue;
      }
      const htmlPath = path.join(resolved, diagram.file);
      if (!fs.existsSync(htmlPath)) {
        note(`bundle/file-missing: ${diagram.file}`);
      }
    }
  });

  const pairById = new Map();
  runCheck('bundle-attrs', () => {
    for (const diagram of diagrams) {
      if (!HTML_FILE.test(diagram.file || '')) continue;
      const htmlPath = path.join(resolved, diagram.file);
      const specPath = path.join(resolved, diagram.file.replace(/\.html$/, '.json'));
      if (!fs.existsSync(htmlPath) || !fs.existsSync(specPath)) continue;
      const htmlBytes = readBytes(htmlPath);
      const specBytes = readBytes(specPath);
      const html = htmlBytes.toString('utf8');
      const tag = svgOpenTag(html);
      const role = diagram.id === manifest.entry ? 'entry' : 'child';
      if (attr(tag, 'data-bundle-id') !== diagram.id
        || attr(tag, 'data-bundle-role') !== role
        || attr(tag, 'data-bundle-spec-sha256') !== diagram.spec_sha256) {
        note(`bundle/child-stale: ${diagram.id} data-bundle-* does not match the manifest`);
      }
      let spec = null;
      try { spec = JSON.parse(specBytes.toString('utf8')); } catch { /* counted in digests */ }
      pairById.set(diagram.id, { html, spec, specPath, htmlPath, htmlBytes, specBytes });
    }
  });

  runCheck('digests', () => {
    for (const diagram of diagrams) {
      const pair = pairById.get(diagram.id);
      if (!pair) continue;
      const artifactSha = htmlArtifactSha256(pair.htmlBytes);
      const specSha = sha256Bytes(pair.specBytes);
      if (artifactSha !== diagram.artifact_sha256) {
        note(`bundle/child-stale: ${diagram.id} artifact_sha256 expected ${diagram.artifact_sha256?.slice(0, 12)} actual ${artifactSha.slice(0, 12)}`);
      }
      if (specSha !== diagram.spec_sha256) {
        note(`bundle/child-stale: ${diagram.id} spec_sha256 expected ${diagram.spec_sha256?.slice(0, 12)} actual ${specSha.slice(0, 12)}`);
      }
    }
  });

  runCheck('embed', () => {
    if (!entry) return;
    const entryPair = pairById.get(entry.id);
    const embeds = entryPair?.html.match(/id="archify-bundle-manifest"/g) || [];
    if (embeds.length !== 1) note('bundle/embed-count: entry must embed exactly one archify-bundle-manifest');
    else {
      const embedded = extractBundleManifestText(entryPair.html);
      if (embedded !== manifestText) note('bundle/embed-mismatch: embedded manifest is not byte-identical to disk manifest.json');
    }
  });

  runCheck('drilldowns', () => {
    const seenPair = new Set();
    for (const row of drills) {
      const parentDiagram = diagrams.find((item) => item.id === row.parent);
      if (!parentDiagram) {
        note(`bundle/drilldown-parent: ${row.parent} is not in diagrams[]`);
      } else {
        const parentIds = new Set(semanticItems(pairById.get(row.parent)?.spec).map((item) => item.id));
        if (!parentIds.has(row.component)) {
          note(`bundle/drilldown-component: ${row.component} is not in ${row.parent}'s semantic collection`);
        }
      }
      if (!diagramIds.has(row.child)) note(`bundle/drilldown-child: ${row.child} is not in diagrams[]`);
      const key = `${row.parent}\u001f${row.component}`;
      if (seenPair.has(key)) note(`bundle/drilldown-duplicate: ${row.component}`);
      seenPair.add(key);
    }
    for (const id of tree.cycle) note(`bundle/drilldown-cycle: ${id}`);
    for (const id of tree.shared) note(`bundle/drilldown-shared: ${id}`);
    for (const id of tree.orphans) note(`bundle/orphan: ${id}`);
  });

  runCheck('node-cap', () => {
    for (const diagram of diagrams) {
      const spec = pairById.get(diagram.id)?.spec;
      const count = semanticItems(spec).length;
      if (count > 12 || (diagram.node_count != null && diagram.node_count > 12)) {
        note(`bundle/node-cap: ${diagram.id} exceeds the 12-node cap`);
      }
      if (count < 1) note(`bundle/node-cap: ${diagram.id} has no primary nodes`);
    }
  });

  runCheck('leaf-mark', () => {
    const parentIds = new Set(drills.map((row) => row.parent));
    for (const diagram of diagrams) {
      if (parentIds.has(diagram.id)) continue;
      const html = pairById.get(diagram.id)?.html || '';
      const marks = (html.match(/\bdata-drilldown-child="/g) || []).length;
      if (marks) note(`bundle/leaf-mark: ${diagram.id} has ${marks} drilldown mark(s); a leaf diagram cannot drill down`);
    }
  });

  runCheck('ownership', () => {
    if (!manifest.ownership) return;
    const ownershipFile = manifest.ownership.file || '';
    if (!OWNERSHIP_FILE.test(ownershipFile)) {
      note('bundle/ownership-missing: ownership sidecar listed in the manifest is not a same-directory file');
      return;
    }
    const ownershipPath = path.join(resolved, ownershipFile);
    if (!fs.existsSync(ownershipPath)) {
      note('bundle/ownership-missing: ownership sidecar listed in the manifest is not a same-directory file');
      return;
    }
    const sidecarBytes = readBytes(ownershipPath);
    if (sha256Bytes(sidecarBytes) !== manifest.ownership.sha256) {
      note('bundle/ownership-stale: ownership sidecar sha256 does not match the manifest');
    }
    // Parse failure and root-shape checks must run — and return — before anything downstream
    // (schema, sibling loading, the tree walk) ever looks at `sidecar`. A literal JSON `null` used
    // to slip past a bare `if (!sidecar) return;` with no failure recorded at all.
    let sidecar;
    try {
      sidecar = JSON.parse(sidecarBytes.toString('utf8'));
    } catch {
      note('bundle/ownership-parse: ownership sidecar is not valid JSON');
      return;
    }
    if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
      note('bundle/ownership-parse: ownership sidecar is not a JSON object');
      return;
    }

    const resolvedOwnershipPath = path.resolve(ownershipPath);
    const sibling = loadSiblingSidecar(resolved, sidecar);
    // The root sidecar's identity is the entry diagram, full stop: manifest.ownership binds this
    // file to the bundle's ownership tree, and that tree is rooted at the entry — being found on
    // disk, matching the schema, or being bound by manifest.ownership.file at all is not proof a
    // sidecar actually describes the entry's own components; only its own `map` resolving to the
    // entry's spec is. An operator may still point --ownership at an arbitrarily-named file (the
    // filename need not be "<entryId>.ownership.json"), but whatever file that is must self-declare
    // `map` as the entry's own spec, not any other diagram's.
    const rootSpecPath = entry ? path.resolve(resolved, entry.file.replace(/\.html$/i, '.json')) : undefined;
    const rootFailures = validateOwnershipSubset(manifest, sidecar, sibling?.data ?? null, resolved, {
      sidecarPath: resolvedOwnershipPath,
      parentSidecarPath: sibling?.path,
      ownSpecPath: rootSpecPath,
    });
    for (const failure of rootFailures) note(failure);
    // A schema failure or an identity mismatch here means `sidecar` itself cannot be trusted for a
    // walk — recursing into its `components[]` regardless (the pre-fix behavior) is what let a
    // malformed root sidecar reach the same raw-TypeError failure mode the child-branch fix (see
    // "if (childFailures.length) continue;" below) already closed one level down.
    if (rootFailures.length) return;

    const visited = new Set([resolvedOwnershipPath]);
    // `currentSpecPath` threads the VERIFIED identity of `current` down through the recursion —
    // for the root that is rootSpecPath (the entry's spec, not necessarily derivable from the root
    // sidecar's own, possibly arbitrary, filename); for anything deeper it is the child_map pointer
    // target that was already used to validate that level. This is what lets a grandchild's
    // parent.map be checked against the parent's REAL identity even when the root file itself
    // isn't named by convention, instead of re-deriving (and getting wrong) that identity from a
    // raw file path.
    const walkOwnershipTree = (current, currentPath, currentSpecPath) => {
      for (const component of Array.isArray(current.components) ? current.components : []) {
        if (!component.child_map) continue;
        // child_map is relative to the directory holding the CURRENT sidecar, not the bundle
        // root — the same convention locate/ownership.mjs uses, and the one that matters once
        // sidecars can live in subdirectories.
        const childOwnPath = defaultOwnershipPath(path.resolve(path.dirname(currentPath), component.child_map));
        if (!fs.existsSync(childOwnPath)) continue;
        const resolvedChildOwnPath = path.resolve(childOwnPath);
        if (visited.has(resolvedChildOwnPath)) {
          note(`bundle/ownership-cycle: ${path.basename(resolvedChildOwnPath)} is already an ancestor in the ownership tree`);
          continue;
        }
        let childSidecar;
        try {
          childSidecar = JSON.parse(fs.readFileSync(childOwnPath, 'utf8'));
        } catch {
          note('bundle/ownership-parse: child ownership sidecar is not valid JSON');
          continue;
        }
        if (!childSidecar || typeof childSidecar !== 'object' || Array.isArray(childSidecar)) {
          note(`bundle/ownership-parse: ${path.basename(resolvedChildOwnPath)} is not a JSON object`);
          continue;
        }
        // The pointer that led us here (`current`'s `component.child_map`) and the pointer the
        // child claims back (`childSidecar.parent`) must name each other — otherwise a sidecar
        // could ride in on the wrong component and inherit exclusions it was never granted.
        if (!childSidecar.parent || typeof childSidecar.parent !== 'object' || childSidecar.parent.component !== component.id) {
          note(`bundle/ownership-not-subset: ${path.basename(resolvedChildOwnPath)} parent.component does not match the "${component.id}" child_map pointer that names it`);
          continue;
        }
        // Validates the full (parent, component, child) triple against manifest.drilldowns, bound
        // to the REAL file we walked from (currentPath) — this is what actually binds childSidecar
        // to *this* drilldown edge, not merely to some other row that happens to share the same
        // component name elsewhere in the tree. The child's expected identity is the child_map
        // pointer's own target spec (not the sidecar's own filename), since that pointer is what
        // actually led here.
        const childSpecPath = path.resolve(path.dirname(currentPath), component.child_map);
        const childFailures = validateOwnershipSubset(manifest, childSidecar, current, resolved, {
          sidecarPath: resolvedChildOwnPath,
          parentSidecarPath: currentPath,
          ownSpecPath: childSpecPath,
          parentSpecPath: currentSpecPath,
        });
        for (const failure of childFailures) note(failure);
        // A schema failure (e.g. a malformed `components` entry) means childSidecar's own shape
        // cannot be trusted for a further walk either — recursing into it here is exactly what
        // used to turn a controlled failure into a raw TypeError one level down.
        if (childFailures.length) continue;
        visited.add(resolvedChildOwnPath);
        walkOwnershipTree(childSidecar, resolvedChildOwnPath, childSpecPath);
        visited.delete(resolvedChildOwnPath);
      }
    };
    walkOwnershipTree(sidecar, resolvedOwnershipPath, rootSpecPath);
  });

  if (failures.length) {
    abort(`Diagram bundle failed validation: ${failures.join('; ')}.`);
  }
  return { ok: true, ...checkSummary(checks) };
}
