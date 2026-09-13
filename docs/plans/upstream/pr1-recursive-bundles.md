# Draft PR 1 — recursive (N-depth) bundles and a recursive Viewer descend

Status: **draft, not opened**. Prepared as part of a fork-side implementation on top of
`feature/identity-map` (#367); posting requires maintainer/user approval.

Base: `tt-a1i/archify` branch `feature/identity-map` (#367, draft, 17 commits as of `cc1b33a`).
Head: fork `Cagatay342/archify` branch `feat/nested-drilldown`, phases 1–2.

## Motivation

#367 ships a two-level bundle: an entry diagram whose nodes carry `components[].drilldown: <id>`,
resolved against a directory manifest, and a Viewer that opens the child in place (iframe,
breadcrumb, silhouette, handshake). §7 of the accompanying decision record
(`docs/decisions/identity-map-2026-09-09.md`) states this as an explicit design choice, not an
oversight: "No third level. `max_depth` is `const: 2`, and check 9 forbids marks on children."

Two earlier, independent proposals asked for more than two levels in different ways:

- #280 (and PR #281): sibling-HTML page navigation via `href`/`drilldowns[]`/`parentHref` —
  landing on a full page reload rather than descending in place, and losing the camera/viewport
  state each hop. Not closed or approved.
- #269: a single HTML file embedding one level of `subarchitecture`, capped at ≤12 nodes, with
  nesting explicitly disallowed.

Neither reaches "zoom into a component and keep going" for an arbitrarily (but boundedly) deep
system. This PR asks the maintainer to revisit the two-level limit specifically for the
descend-in-place mechanism #367 already built, since the mechanism itself does not need to stop
at one level — only the schema constant and the check that enforces it do.

## Scope (phases 1–2 of the fork's plan)

**Schema (`archify/schemas/bundle.schema.json`)**

- `max_depth`: `const 2` → `integer, minimum 2, maximum 8`. A manifest still declares its own
  real depth; a two-level bundle still validates as `max_depth: 2` and produces a byte-identical
  manifest to before this change (regression-tested).
- `diagrams[].level` ceiling changes from an implicit "0 or 1" to `<= max_depth - 1`. Since a
  fixed integer cannot express a schema-relative maximum, the schema keeps a fixed ceiling
  (`level <= 7`, i.e. `max_depth`'s own maximum minus 1) and the *real* depth-vs-`max_depth`
  consistency is enforced in the manifest/tree check below, not in JSON Schema alone.
- `diagrams[]`'s `maxItems: 13` is removed (the existing per-node ≤12-children rule already
  bounds fan-out at every level; the array-length cap was only ever a stand-in for the two-level
  case).

**Manifest generation and validation (`archify/bundle/diagram-bundle.mjs`)**

- Entry resolution: the single diagram that is never any other diagram's drilldown target, same
  rule as today, generalized to N levels instead of assuming a fixed two-tier shape.
- `drilldowns[].parent` may now name *any* diagram in the bundle, not only the entry.
- The existing DAG check (check 7, `bundle/drilldown-nested`) is tightened to a **tree**
  invariant: every child has exactly one parent, no cycles, and no diagram is unreachable from the
  entry. Two new hard failures this introduces, **at any depth, including two levels**:
  `bundle/drilldown-shared` (a diagram targeted by more than one drilldown row — the old DAG check
  tolerated a shared child; a tree does not), `bundle/drilldown-cycle` (a cycle in the drilldown
  graph — the old check already rejected this, so no behavior change here, listed for completeness),
  and `bundle/orphan` (a diagram present in the bundle directory but unreachable from the entry).
- Check 9 ("no drilldown mark on a child") is generalized to "no mark on a **leaf**"
  (`bundle/leaf-mark`): any diagram with no diagram below it may not itself carry a further
  drilldown mark, at any level.
- Two new depth-related failures, easy to confuse — naming them precisely because an earlier draft
  of this PR description had them backwards: **`bundle/max-depth`** fires when a manifest's
  declared `max_depth` doesn't match the tree's own computed depth (`diagram-bundle.mjs:621`);
  **`bundle/depth-exceeded`** fires only when the tree itself exceeds the hard 8-level ceiling
  (`diagram-bundle.mjs:610`).
- Ownership sidecars (`<stem>.ownership.json`) chain the same way parent→child ownership already
  does at one level: a grandchild's sidecar names its own direct parent's map, unchanged from the
  existing single-hop contract, just no longer artificially cut off at depth 1.

**Backward compatibility — narrower claim than an earlier draft of this description made**

Every existing two-level bundle *that is already tree-shaped* continues to validate unchanged,
and its generated manifest is byte-identical to the pre-change output for the one fixture this
was actually checked against (`archify/test/fixtures/bundle-checkout/`, see Compatibility
evidence below) — that is evidence for that one fixture, not a claim verified across every bundle
this schema has ever accepted; no scan of other real-world bundles against the old vs. new
validator was performed. **This is not "no previously accepted bundle is rejected."** The new
`bundle/drilldown-shared` and `bundle/orphan` checks are strictly stricter than the old DAG-only
check, at *any* depth: a two-level bundle that happened to have a diagram targeted by two
different drilldown rows, or a diagram present in the directory but never reached by any
drilldown row, validated under the old check and will now fail. Whether such bundles exist in
practice (upstream or in the wild) is unknown to this PR.

**Viewer (`viewer/template.source.html`'s `Archify.drilldown`, generated into
`archify/assets/template.html` via `npm run generate:viewer`)**

- The `nestedChild()` guard that unconditionally blocked descending from inside an already-nested
  child is replaced by "an alt-tree manifest for the next level has been received, and depth <
  max_depth" — the same descend code path now runs recursively, one full Viewer instance per
  iframe, at any depth.
- **Manifest distribution**: a child under `file://` cannot read a sibling JSON directly, so the
  parent's `archify:bundle-hello` handshake message now carries the child's own **subtree**
  manifest (`{diagrams, drilldowns}` restricted to what's below that child) in addition to the
  existing id/sha256 identity fields. The child holds this in memory for its own descend; nothing
  is written to disk a second time.
- **Breadcrumb**: rendered once, at the root. Each descended child posts
  `archify:bundle-crumb {chain: [...]}` up to its own parent; the root accumulates the full chain
  and renders every rung as a clickable "ascend to this level" control. The silhouette (a
  cropped preview of the immediate parent, unchanged from #367) still shows only one level up,
  regardless of total depth.
- **Escape/Backspace**: the innermost open level consumes the key first; once its own stack is
  empty, the existing "hand it to the parent" behavior propagates up one level at a time,
  independent of how many levels are currently open (previously hard-coded to the two-level
  case).
- **Message contract**: every cross-frame message (`archify:bundle-hello` / `-ack` /
  `-crumb` / `-ascend-request` / `-ascend-done` / `-escape`) carries a per-descent `session`
  number and, for ascend round-trips, a `requestId`; a message whose session doesn't match the
  live descent (a stale ack from a superseded or already-closed handshake) is rejected outright,
  with no "session absent, accept anyway" legacy path. A parent only ever talks to its **direct**
  child; a grandchild's messages are relayed hop-by-hop, never sent straight to the root — the
  same boundary #367 already enforces at one level, just recursive now.
- Handshake security (`event.source === frame.contentWindow` identity check, id/sha256 regex
  validation, the existing stale-card timeout) is unchanged in kind, only no longer capped at one
  hop.
- Depth ≥1 restrictions #367 already applies (Presentation disabled, motion set to `still`) are
  unchanged and now apply uniformly at every depth, not only depth 1.
- Export is per-level and untouched: each Viewer instance still exports only its own SVG, exactly
  as #367 already does at one level — a deeper tree doesn't change what any single level exports.

## Compatibility evidence

- Two-level fixture (`archify/test/fixtures/bundle-checkout/`): manifest generated by the new
  code is byte-identical to the one generated before this change.
- New three-level fixture
  (`archify/test/fixtures/bundle-checkout-deep/`, entry → child → grandchild): `bundle --check`
  passes every existing check plus the new tree/leaf-mark/depth checks.
- Negative fixtures for `bundle/max-depth`, `bundle/depth-exceeded`, `bundle/drilldown-shared`,
  `bundle/orphan`, and `bundle/leaf-mark`.
- **Not "pass unchanged"**: #367's own pre-existing test files were themselves edited for this
  PR, not left alone — `bundle-message-origin-browser.test.mjs`, `bundle-ownership.test.mjs`,
  `bundle-schema.test.mjs`, `bundle-validate.test.mjs`, `drilldown-browser.test.mjs`,
  `drilldown-keyboard.test.mjs`, `generate-validators.test.mjs`, `generate-viewer.test.mjs`, and
  the shared `helpers/bundle-fixture.mjs` all changed where the contract itself changed (new
  failure codes, the tree invariant, the N-depth manifest shape). What *is* true: after those
  edits, all of #367's original *scenarios* (descend, breadcrumb, Escape ladder, stale card,
  ownership, keyboard) still pass at depth 1, proving the two-level case is a strict subset of the
  new behavior rather than a separately maintained path — not that the test files went untouched.
- New Chrome tests exercise depth 2 explicitly: a real three-level descend/ascend with the entry
  breadcrumb aggregating all three rungs, a real OS-level keyboard Escape closing one level at a
  time from inside the innermost (grandchild) iframe (see the harness note in
  `archify/test/drilldown-nested-browser.test.mjs` for what real `Input.dispatchKeyEvent` routing
  across two nested same-origin iframes actually requires — it is possible, but not with a plain
  `.focus()` call alone), and the same three-level descend opened directly over `file://` (no
  local HTTP server) to prove the subtree-manifest handshake works under `file://`'s stricter
  per-file origin model, which is the whole reason that handshake exists.

## Known limitations carried over from this PR's own scope

- iframe nesting means each level loads a full Viewer instance (~800 KB HTML each); this is
  workable at the documented practical depth (3–4 levels) but `max_depth`'s hard ceiling of 8 is
  a deliberate, conservative stop, not a claim that 8 levels is a good user experience.
- No deep-linking (`#drill=a/b/c`) in this PR — the existing hash-parsing consumers
  (`focus.js`, `guided-views.js`) would need to learn a new hash key first; left for a follow-up.
- No auto-generation of children from a codebase scan — bundles remain fully authored, consistent
  with the existing "No automatic generation of children" non-goal.

## PR template fields (CONTRIBUTING.md's evidence-by-impact table, REVIEWING.md §1-§3)

**Impact class**: *Contract change* (schema, defaults, validation acceptance) — the table's
highest tier, requiring agreed scope, explicit allowed/preserved behavior, and both shared and
local evidence. This description exists specifically to let the maintainer settle that scope
before implementation is treated as done.

**Actual results / exceptions** (not just "checks pass"):
- Full evidence-suite run this PR relies on: 1609 tests, 1602 pass, 2 fail, 5 skip (2 known-bad
  host files excluded per repo convention: `motion-governor-browser.test.mjs`,
  `update-notifier.test.mjs`). The 2 fails (`route-journey.test.mjs`, `route-probe-browser.test.mjs`
  — files this PR does not touch) pass in isolation and are assessed as concurrent-load-sensitive
  timing tests, not a proven regression; that assessment itself is not airtight (see the Faz 5
  report's own caveat) and deserves independent re-verification before merge.
- A known, separate flake in `viewer-wheel-browser.test.mjs` (camera wheel/pinch, unrelated to
  this PR's bundle/viewer-descend surface) was found, misdiagnosed once as product-caused, and
  reverted to its last-accepted state after a bisect proved the diagnosis wrong. Left as an open
  item, not resolved by this PR.
- `docs/cases/archify-self` and `docs/cases/mco-runtime.*`/`experiments/mco-showcase` (generated
  artifacts that embed the same Viewer template this PR changes) could **not** be rebuilt in the
  fork environment this PR was prepared in — the former needs a checkout whose git `origin`
  resolves to `tt-a1i/archify`, the latter needs a local checkout of the external `mco-org/mco`
  repository. Both are stale relative to this PR's template change and **must be rebuilt in the
  maintainer's own environment before merge** — that rebuild has not happened and is not evidenced
  here.

**Visual evidence**: the Faz 4 nested-chrome CSS change (padding/margin only, no behavior change,
same Viewer surface this PR's recursive descend renders through) has before/after screenshots and
numeric metrics at `docs/plans/reports/faz5-evidence/01-root-level0-{before,after}.png`,
`02-level1-child-{before,after}.png`, `03-level2-grandchild-{before,after}.png`, and
`metrics-{before,after}.json`, referenced from `docs/plans/reports/faz5-release-prep-2026-09-13.md`.
No comparable screenshots exist yet for the N-depth descend/breadcrumb/Escape behavior itself
(browser-test coverage exists; a human-reviewable visual diff does not) — a gap worth closing
before this is posted for real review.

**Generated-file exceptions**: see "Backward compatibility" and the Faz 5 report — everything that
embeds the Viewer template was rebuilt except `docs/cases/archify-self` and
`docs/cases/mco-runtime.*`/`experiments/mco-showcase`, both blocked in this environment (above).

## Non-goals restated (unchanged from #367)

Everything in `docs/decisions/identity-map-2026-09-09.md` §7 that isn't specifically about the
two-level ceiling is unchanged by this PR: no impact/causality/risk inference, no import-fact
reconciliation, no implicit glob priority, no map auto-generation or auto-editing, no coverage
gate beyond `--lint`, no path targets, no single-file embedding of children, no auto-layout, no
model calls or network access in `locate`/`bundle`.
