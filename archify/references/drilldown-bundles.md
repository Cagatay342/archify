# Drilldown bundles reference

Read this reference only when the user asks for a diagram whose components expand into their own
diagrams, or asks about `archify bundle`. A single diagram never needs it.

A drilldown bundle is one directory holding one entry diagram, a tree of same-directory children
(at most twelve per parent — the node cap applies per diagram, not to the bundle as a whole), and
a `manifest.json` that binds them by diagram id and content digest. Reading is descend-in-place:
the parent shrinks to a breadcrumb and a silhouette, the child opens on the same canvas, and
returning restores the parent's exact geometry and scroll position.

## When to use it

Use a bundle when one component of a map has enough internal structure to deserve its own diagram
and the twelve-node cap makes inlining it dishonest. Keep a single diagram when the detail fits.
Depth ranges from two levels up to eight; a child can itself declare its own drilldowns and become
a parent, so the whole bundle forms a tree rooted at the entry. Three to four levels is typical —
each extra level is a full nested viewer document, so go deeper only when the structure genuinely
nests that far.

## Commands

```
archify bundle <dir> [--json]
archify bundle <dir> --check [--json]
```

Without `--check`, the command re-renders each diagram with its bundle attributes, writes
`manifest.json` atomically, refreshes the entry's embedded manifest copy, and then validates.
With `--check` it validates only and writes nothing. Human output is one line
(`bundle ok <dir> (10/10 checks)`); `--json` prints a receipt with `schemaVersion`, `ok`,
`command`, `action`, `dir`, `checksPassed`, `checkCount`, and `diagnostics`. `checksPassed` and
`checkCount` are derived from the checks that ran (`archify/bundle/diagram-bundle.mjs:360-365`,
`:584`). The `--bundle-*` flags are parsed once at each renderer CLI entry and passed into
`svgRootAttrs`; the library function does not read `process.argv`. Re-render also sets
`ARCHIFY_REPO_ROOT` from the Git top-level of the current working directory so architecture
maps that declare source evidence can verify (`archify/bundle/diagram-bundle.mjs:211-217`,
`:249`).

## Directory layout

One directory is one bundle. Every diagram is a same-directory `<id>.html` paired with the
`<id>.json` it was rendered from. Subdirectories, `../`, absolute paths, and URL schemes are not
representable — filenames must match `^[A-Za-z0-9][A-Za-z0-9._-]*\.html$`, in the schema and again
in the viewer before an iframe is pointed at one.

```
docs/cases/archify-self/
  archify-self.html                  entry   (architecture, level 0)
  archify-self.json
  archify-self.ownership.json        optional sidecar
  archify-renderers.html             child   (architecture, level 1)
  archify-renderers.json
  archify-renderers.ownership.json
  render-pipeline.html               child   (workflow, level 1)
  render-pipeline.json
  render-pipeline.ownership.json
  manifest.json
```

A child may be any of the five diagram types. The self-map uses a workflow child under an
architecture entry.

A bundle deeper than two levels is still one flat directory — a grandchild sits beside its parent
and the entry, not in a subdirectory. Its `<id>.json` names a `drilldown` on one of the parent's
own components, and its optional ownership sidecar's `parent` pointer names the parent diagram's
spec, not the entry's:

```
checkout-platform.html               entry   (architecture, level 0)
checkout-platform.json
payments.html                        child   (architecture, level 1)
payments.json                        components[].drilldown: "settlement" on one component
settlement.html                      grandchild (architecture, level 2)
settlement.json
settlement.ownership.json            parent: { map: "payments.json", component: "psp" }
manifest.json
```

## Adding a drilldown child

1. Author the child diagram JSON as an ordinary diagram, with its own coordinates and at most
   twelve primary nodes. Give it a filename stem that is a valid diagram id
   (`^[a-zA-Z][a-zA-Z0-9_-]*$`); that stem *is* the id.
2. Deliver both parent and child into the same directory, so each `<id>.html` sits beside its
   `<id>.json`.
3. On the parent architecture component, add `"drilldown": "<child stem>"`. The target is a
   diagram id, never a path. One component may declare at most one child.
4. Optionally add an ownership sidecar pair: `parent: { map, component }` on the child,
   `child_map` on the parent component. If any `*.ownership.json` files are present, the
   entry sidecar must be named `<entryId>.ownership.json`; otherwise the bundle fails with
   `bundle/ownership-missing` (`archify/bundle/diagram-bundle.mjs:219-228`). Every child
   glob — `components[].globs` **and** `excluded` — must be a syntactic subset of the parent
   component's globs (`validateChildOwnershipSubset`, `archify/locate/ownership.mjs:222-248`).
   Parent `excluded` is inherited at projection time and does not have to be repeated — see
   `locate.md`. A child `parent` pointer that names a missing map or sidecar is
   `locate/ownership-parent-missing`.
5. Run `archify bundle <dir>`.

The entry is inferred: it is the unique diagram that declares drilldowns and is not itself a
target. A directory with no unique root fails with `bundle/entry-ambiguous`.

The renderer draws the drilldown mark into the SVG from the diagram's own JSON, so it survives
canonical export and no tool rewrites delivered bytes to add it. The node group also gains
`data-drilldown-child`.

## Manifest

`manifest.json` is validated by `schemas/bundle.schema.json` and rejects unknown fields.

```json
{
  "schema_version": 1,
  "bundle_type": "drilldown",
  "entry": "checkout-platform",
  "max_depth": 3,
  "diagrams": [
    {
      "id": "settlement",
      "file": "settlement.html",
      "diagram_type": "architecture",
      "title": "Card Network Settlement",
      "level": 2,
      "node_count": 3,
      "spec_sha256": "3d951943eab2…",
      "artifact_sha256": "ae93996cb6c3…"
    }
  ],
  "drilldowns": [
    { "parent": "checkout-platform", "component": "payments", "child": "payments", "label": "Payment Rail" },
    { "parent": "payments", "component": "psp", "child": "settlement", "label": "Card Network" }
  ],
  "ownership": { "file": "checkout-platform.ownership.json", "sha256": "f4d57bce1a2d…" }
}
```

`max_depth` is an integer from `2` to `8`, set by the producer to one more than the deepest
`diagrams[].level` actually present (the entry is always `level: 0`); a bundle with only direct
children stays `max_depth: 2`, exactly as before N-depth support. `diagrams` has no upper bound
on count, but every diagram still carries at most twelve primary nodes and `level` never exceeds
`7`. `drilldowns[]` is the parent/component/child resolution table used by both the validator and
the viewer; each row's `parent` is the id of whichever diagram in the bundle declares that
component's `drilldown` — the entry for a level-1 child, a level-1 diagram for a level-2
grandchild, and so on. The diagram JSON only ever names an id, never a path.

The entry HTML embeds a byte-identical copy of the manifest as
`<script id="archify-bundle-manifest" type="application/json">`, because a `file://` document
cannot fetch a sibling JSON file. The disk `manifest.json` stays the normative source, and the
validator forces the two to remain byte-equal.

## The two digests

| Digest | Over | Used by |
|---|---|---|
| `spec_sha256` | the sibling `<id>.json` bytes | the runtime handshake; the renderer writes it onto the SVG root as `data-bundle-spec-sha256` and the child reports it back |
| `artifact_sha256` | the `<id>.html` bytes on disk | offline validation only; a self-contained HTML file cannot carry its own digest, and a `file://` parent cannot read child bytes |

They are not interchangeable. Re-delivering any diagram requires re-running `archify bundle`.

One exception: for a file that already carries an embedded manifest, the artifact digest is
computed after stripping the `archify-bundle-manifest` script. Otherwise injecting the manifest
would change the bytes the manifest describes and the entry could never validate. The consequence
is that `artifact_sha256` pins the entry's pre-injection bytes.

## Validation

`archify bundle --check` first checks the manifest. If it is missing, cannot be parsed, or fails
the schema, validation stops there. With a valid manifest it runs the remaining checks and
collects their failures. The ten checks are:

1. `manifest.json` exists, parses, and passes the schema.
2. the entry exists in `diagrams[]` at `level: 0`; every other diagram's `level` equals its
   breadth-first depth from the entry along `drilldowns[]` (`bundle/child-level`); `max_depth`
   equals one more than the deepest depth found (`bundle/max-depth`); a tree deeper than 8 levels
   fails outright (`bundle/depth-exceeded`). The walk itself is depth-first, not breadth-first: in
   a valid tree (a single parent per diagram) that gives the same `level` a breadth-first walk
   would, since `level = parent's level + 1` along the one path that exists; in an invalid graph
   (a shared child or a cycle, both rejected outright) `level` is whatever depth the walk first
   discovered the diagram at, not necessarily the shortest path to it.
3. `id` and `file` are unique, and each `file` is an existing same-directory HTML name.
4. each HTML's `data-bundle-id`, `data-bundle-role`, and `data-bundle-spec-sha256` match the
   manifest.
5. recomputed artifact and spec digests match the manifest.
6. the entry embeds exactly one manifest copy, byte-identical to disk.
7. every drilldown row: the `parent` exists in `diagrams[]` (not necessarily the entry), the
   `component` exists in that parent's semantic collection, the child exists in `diagrams[]`, at
   most one child per `(parent, component)` pair. The whole table must form a tree: a diagram
   reachable by more than one row is `bundle/drilldown-shared`, a row that targets an ancestor of
   its own parent is `bundle/drilldown-cycle`, and a diagram unreachable from the entry is
   `bundle/orphan`.
8. every diagram has between 1 and 12 primary nodes.
9. only leaf diagrams (diagrams that declare no drilldown of their own) are checked for a stray
   mark — a leaf's HTML must not carry `data-drilldown-child` (`bundle/leaf-mark`). An
   intermediate diagram's HTML is expected to carry the mark for its own children and is not
   inspected by this check.
10. when a sidecar is listed: the file exists, its digest matches, it parses, and every child
    sidecar glob (component globs and `excluded`) is a subset of the parent component that
    declares the drilldown (`validateChildOwnershipSubset` via
    `archify/bundle/diagram-bundle.mjs:126-133` and the recursive walk in `validateBundle`'s
    ownership check). This walk follows every `child_map` pointer, however many levels deep, and
    guards against a `child_map` that points back at one of its own ancestors
    (`bundle/ownership-cycle`) instead of recursing forever. A `parent.component` shared by more
    than one drilldown row (the same component id reused across different diagrams) must set
    `parent.map` to disambiguate which row it binds to, or the sidecar fails
    `bundle/ownership-not-subset` as ambiguous. Parent `excluded` is inherited at locate
    projection time, not re-checked as a cover relation. The sidecar file, when present, must be
    `<entryId>.ownership.json`.

Failure codes are `bundle/entry-level`, `bundle/child-level`, `bundle/max-depth`,
`bundle/depth-exceeded`, `bundle/duplicate-id`, `bundle/duplicate-file`, `bundle/file-path`,
`bundle/file-missing`, `bundle/child-stale`, `bundle/embed-count`, `bundle/embed-mismatch`,
`bundle/drilldown-parent`, `bundle/drilldown-component`, `bundle/drilldown-child`,
`bundle/drilldown-duplicate`, `bundle/drilldown-cycle`, `bundle/drilldown-shared`,
`bundle/orphan`, `bundle/node-cap`, `bundle/leaf-mark`, `bundle/ownership-missing`,
`bundle/ownership-stale`, `bundle/ownership-parse`, `bundle/ownership-not-subset`,
`bundle/ownership-cycle`. Manifest
construction can also fail with `bundle/dir-missing`, `bundle/id-invalid`, `bundle/spec-missing`,
`bundle/spec-parse`, `bundle/empty`, `bundle/entry-ambiguous`, `bundle/entry-missing`,
`bundle/type-unknown`, `bundle/render-failed`, or `bundle/embed-missing`.

`bundle/drilldown-nested` and `bundle/child-mark` no longer exist — they were the two-level-only
rule that a child can never itself be a parent. `bundle/drilldown-shared`, `bundle/orphan`,
`bundle/depth-exceeded`, and the generalized `bundle/leaf-mark` take their place for the tree
shape and leaf-only mark rule described above.

Manifest validation can fail with `bundle/manifest-missing`, `bundle/manifest-parse`, or
`bundle/schema: <path> <message>`. These are entries in
`diagnostics[0].evidence.failures[]`; the diagnostic's top-level `code` is `bundle/invalid`.
For these early failures, the evidence reports `checksPassed: 0` and `checkCount: 1`, because
the remaining checks did not run.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | the bundle was written and validated, or `--check` passed |
| 2 | any validation or construction failure, and any usage error |

There is no exit-1 tier. Failures surface as one diagnostic with `code`, `message`, `subject`,
`evidence.failures[]`, and `supportedFixes`. When any failure concerns a digest or attribute
mismatch, the top-level code is promoted to `bundle/child-stale`.

## Reader behavior

**Descending.** Single click keeps its existing one-hop focus meaning. Descending happens through
the named `Descend` control in the Semantic Passport, or by activating the drilldown mark on the
node. Keyboard activation works because the node is already a focusable button. A child that is
itself not a leaf offers the same control for its own components, so a diagram can be descended
into a second and a third time — a viewer being nested no longer disables its own descend.

For scripts and headless readers, `Archify.drilldown.descend(componentId)` starts a descent from
the current diagram's own node. Pass the node's semantic ID (`data-node-id`), not the child
diagram ID. The Viewer resolves the child through the node's annotation and its own manifest — the
entry's embedded copy at level 0, or the subtree its parent handed down at any deeper level.

The call returns a boolean synchronously. `false` means no descent started: this document already
has a child of its own open, `myDepth + 1 >= max_depth` (a defensive ceiling on top of the tree's
own natural bound), or the clicked node carries no `data-drilldown-child` annotation or no manifest
(embedded or inherited) is available yet. A missing `(parent, component, child)` row matching this
document's own diagram id, the clicked component, and the node's own baked `data-drilldown-child`
annotation all three at once does **not** return `false` — a component id reused by a different
diagram, or a row whose declared child names a different diagram than the node's own annotation,
shows the stale card (`showStale('missing-row')` or `showStale('missing-child')`) and still returns
`true`. `true` means the request was handled; it may start loading a child
or immediately show a stale card for an invalid bundle reference. It does not confirm that the
iframe loaded or its handshake succeeded. The frame remains hidden until the expected diagram ID
and spec digest pass the handshake. Neither `active()` nor `data-drilldown-state="open"` before
a completed handshake is a readiness signal — the readiness state moves `descending` → (ack)
`open` → `ascending` → (removed), and only a successful ack ever writes `open`, with or without
reduced motion; `data-drilldown-state` itself never changes for any other reason; a separate,
purely cosmetic `data-drilldown-anim` attribute tracks the CSS transition window instead. Use
`Archify.drilldown.back()` to return to the direct parent, or `Archify.drilldown.ascendTo(depth)`
to close every level below a given absolute depth (the entry is depth 0) in one call — used by
clicking an earlier breadcrumb rung; the innermost open level always finishes closing first.

Bundle click/load/message listeners are registered for an entry with an embedded manifest, and
for any diagram rendered with a `child` bundle role, whether or not it is currently sitting
inside an iframe — that static role (not runtime nesting) is what lets a child register its own
descend handling once its parent's subtree arrives. Ordinary Viewers, with neither an embedded
manifest nor a bundle role, still register nothing.
Offline `file:` documents have opaque origins, so their `postMessage` transport uses `"*"`;
receivers validate the actual source window, bundle role and message shape, and the parent
verifies the child's ID and spec digest. The wildcard is not permission for an unrelated
embedding page to turn an ordinary Viewer into a bundle child. A hello's handed-down subtree is
itself shape-validated (every diagram's id/file/spec digest format, every drilldown row's
parent/component/child, `depth < max_depth`) before it is accepted; an invalid one is silently
not acked, so the parent's own handshake times out and shows its own stale card rather than the
child running on a malformed hand-down. Every navigation message — ack, escape, breadcrumb update,
and the ascend-request/ascend-done pair — carries the originating descent's session number, and it
is mandatory: a message with no session field is rejected exactly like one with the wrong value,
there is no "absent session, accept anyway" fallback. An ack is additionally accepted only while
this document's own state is `descending` (never while `ascending`/`stale`, and never a duplicate
once already `open`, so a stray or replayed ack cannot re-run the handshake or reset the
breadcrumb chain beneath this level), and a breadcrumb update only while `open`. The ascend-request/
ascend-done pair also carries a request id, so a superseded ascend's own settle — its fallback timer
is actively cancelled, not merely disconnected, whenever a newer request or a `back()`/new descend
supersedes it — cannot act on a session it no longer belongs to even in a race. That fallback timer
is not one flat duration at every level: a level waits `250 * max(1, maxDepth - myDepth)` ms
(`maxDepth` from the manifest's own `max_depth`, defaulting to `2` if unavailable) before giving up
on its own child's `ascend-done` and closing it on the timeout alone — sized from each level's
static distance from the tree's own maximum depth, not from how many hops have been reported
upward so far, since that count can still be empty while a deeper handshake is in flight and has
not yet reported anything. A flat, unscaled timeout at every level, or one derived from what has
been reported so far, cannot guarantee the innermost level's own fallback always expires first, and
did not in an observed case. A document only
ever reads a message from its own direct parent or its own direct child — a root and a grandchild
never address each other.

**Any nested level.** A breadcrumb is drawn once, at the root, as the full chain from the entry
down to whichever level is currently deepest: `<entry title> › <rung 1> › <rung 2> › …`, each
non-final rung a button that ascends to that depth, and only the final rung carrying
`aria-current="page"`. Every level below the root reports its own one-hop contribution up to its
own direct parent; an intermediate level neither draws its own breadcrumb nor its own silhouette
(both are hidden by `data-bundle-nested`) — only the root ever shows the 96 px silhouette,
structure only, no text, sigils, beacons or brand marks, marking the descended component in
Verified Cyan. Each child, at whatever depth, fills the canvas as a complete viewer with its own
Passport, focus, lens, route probe, finder, theme, preset, and export.

**Returning.** The parent SVG never leaves the DOM or the layout: it stays in flow with
`visibility: hidden` while the child is overlaid, and the adaptive reader's re-measure is frozen
while descended, so no fit runs and `back()` simply reveals the same geometry. Window and canvas scroll
offsets are captured on descend and restored on ascend, and focus returns to the node that was
originally descended from. `Esc` ascends one level at a time, `Backspace` is a synonym, and a
breadcrumb rung's click ascends directly to that rung's depth. The drilldown rung sits at the
outer end of the existing Escape ladder, so transient states inside the child are cleared first.
Whichever level has focus — including the root itself, even while a grandchild is the deepest
open level — its Escape closes only the innermost open level, one hop, never more than one per
keystroke. A level that has exhausted its own ladder forwards the keystroke to its own direct
parent, so `Esc` works with focus at any depth.

**Disabled while nested.** Presentation Stage is unavailable while nested. A nested child starts
in Still and does not auto-play a trace. Focus, lens, route probe, intent trace, presentation, and
guided views are cleared before descending and are not restored afterwards — what is restored is
geometry, not temporary state. The Route Probe, Semantic Radar, Semantic Lens, Node Finder and
Diagram Guide controls are hidden while nested; the zoom in/out/reset controls and the Descend
control are not — both work at any nested depth, since descending further is exactly what a
nested viewer needs to keep offering.

**Motion.** Descend and ascend run at roughly 170 ms and switch instantly under
`prefers-reduced-motion`.

## Stale children

Nothing is rendered when identity does not line up.

After the iframe loads, the entry posts a hello carrying the expected id and spec digest. The
child answers with its own `data-bundle-id` and `data-bundle-spec-sha256`. The parent accepts a
reply only from the frame's own window, and only when the id and digest match the expected
patterns. A mismatch, a missing attribute, an unsafe filename, or a handshake that does not
complete within 1200 ms removes the iframe and shows an explicit stale card naming:

- the expected and actual diagram id,
- the first twelve hex characters of the expected and actual spec digest,
- the failure reason,
- and the single repair action, `archify bundle <dir>`.

The breadcrumb stays and the return path still works. The same fact is reported offline as
`bundle/child-stale`.

## Change projection

`archify locate … --bundle <dir>` writes a copy of the entry HTML carrying
`<script id="archify-locate-projection" type="application/json">`. The entry applies component
states to its own nodes on load, and forwards the child's node states after a successful
handshake.

The visual rules are deliberately narrow. Untouched nodes dim; `touched` and `stale` stay lit. The
parent chip reads "N FILES TOUCHED INSIDE" and is hidden when the count is zero — a clean
projection is an empty list, not a reassurance. There are no check marks, no green, and no risk
or merge vocabulary; `stale` gets its own non-green treatment. With no projection attached, no
projection attributes are written and every node renders fully lit.

A lit node means one thing: at least one changed path in the range matched that component's
globs. It is not a claim about behavior, correctness, or consequences.

**The parent-child chain.** `archify locate --bundle` walks `manifest.drilldowns[]` in the order
implied by `diagrams[].level` — every row whose `parent` is shallower is resolved before a row
whose `parent` is one of its own targets — so a grandchild's ownership is always loaded after its
parent's. For each row it binds that child's ownership sidecar to the diagram named by `parent`
(not necessarily the entry): the sidecar's `parent.component` must match the row's `component`,
and `parent.map` must resolve to that parent diagram's spec, or the CLI fails with
`locate/bundle-incomplete`. A diagram's `excluded` globs accumulate down the chain —
`inheritParentExcluded` is applied once per hop, so a grandchild's effective `excluded` is the
entry's `excluded` plus its parent's plus its own, in that order — which is what lets an entry-
level exclusion suppress a match two or more hops down without every intermediate sidecar
repeating it. `childReceipts` stays one flat map keyed by diagram id (`children.<id>`) regardless
of nesting depth; the viewer and the embedded projection are unaffected by how deep a given id
actually sits.

## Worked example: the Archify self-map

`docs/cases/archify-self/` is a working bundle: a ten-component architecture entry with two
children — an architecture child for the typed renderers and a workflow child for the render
pipeline — plus three ownership sidecars and two checked-in locate receipts. Rebuild it from the
repository root:

```bash
node archify/bin/archify.mjs bundle docs/cases/archify-self
node archify/bin/archify.mjs bundle docs/cases/archify-self --check --json
```

The locate commands that produce the two PR receipts, and the rule that only
`locate.receipt.json` is kept under each PR folder, are in
`docs/cases/archify-self/README.md` and in `locate.md`.

## Not supported

Depth above 8 levels. No shared children — the bundle is a tree, not a DAG: a diagram can be the
`child` of at most one drilldown row, and a row may not target an ancestor of its own parent. No
inline single-file bundles. No bare-path or cross-directory targets, and no `http(s)` targets. No
automatic generation of children — a child is an authored diagram. No auto-layout. No network
access and no model call anywhere in `bundle` or in the viewer runtime.
