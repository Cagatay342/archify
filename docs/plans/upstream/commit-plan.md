# Proposed commit plan for `feat/nested-drilldown`

Not executed here — no commits were made (per the task's rules, git commit/push is a user/Fable
step). Astra's review of this plan's first draft found it "directionally right, execution
incomplete": hunk-splitting shared files across the two PR heads is **not optional**, the camera
commit was missing its own template regeneration, several test-infra/tooling changes were left out
entirely, and the abandoned `settle()`-rewrite was still listed as if it shipped. This revision
fixes all four. Order follows astra's own recommendation: bundle → recursive viewer + nested CSS →
PR1's generated-artifact rebuild → camera → dive → PR2's generated-artifact rebuild — each PR head
built from its own final source, PR2 stacked on top of PR1's head rather than sharing one combined
tail commit.

## Why hunk-splitting is required, not optional

PR1 (bundle depth + recursive descend + nested-chrome CSS) and PR2 (camera gestures + dive) are
two **separately reviewable PRs on two different heads** — PR2 branches from PR1's head. Several
files carry edits that belong to both: `viewer/template.source.html`, `viewer/viewer-camera.js`
(PR2 only, but shares the file with nothing from PR1 — see below), `archify/renderers/shared/
i18n.mjs`, `README.md`/`README_EN.md`/`README_ZH.md`, `CHANGELOG.md`. Committing any of these
whole-file to PR1 would drag PR2's not-yet-reviewed camera/dive strings and prose into PR1's diff;
committing them whole-file to PR2 would omit PR1's own recursive-descend documentation from PR1's
own PR. Each commit below therefore names which **hunks** (by function name, CSS selector, or
prose section) go to it — `git add -p` (or `git diff` + manual patch selection) is how a human or
Fable actually stages them; this plan is the map for doing that, not a claim that whole-file
staging is acceptable.

## PR1 branch (base: `feature/identity-map` / #367)

### 1. `feat(bundle): recursive (N-depth) bundle manifests and tree validation`

Whole files (no PR2 content in any of these):

- `archify/schemas/bundle.schema.json`
- `archify/bundle/diagram-bundle.mjs`
- `archify/references/drilldown-bundles.md`
- `archify/schemas/README.md`
- `archify/locate/cli.mjs` (ownership sidecar chain generalized past one hop)
- `archify/renderers/shared/generated-validators.mjs` (generated from the schema change; kept with
  this commit as `npm test`'s own freshness-gated pair with the schema, not the later chore commit)
- `archify/test/bundle-schema.test.mjs`, `bundle-validate.test.mjs`, `bundle-ownership.test.mjs`,
  `bundle-message-origin-browser.test.mjs`, `helpers/bundle-fixture.mjs`
- `archify/test/bundle-depth.test.mjs`, `locate-bundle-depth.test.mjs` (new)
- `archify/test/fixtures/bundle-checkout-deep/` (new), `fixtures/bundle-checkout/
  manifest.reference.json` (new)

### 2. `feat(viewer): recursive descend, breadcrumb and Escape ladder`

**`viewer/template.source.html` — hunk-split from commits 4/5 (dive) and PR2's own edits**: only
the `Archify.drilldown` module's changes — `nestedChild()` guard replacement, subtree-manifest
handling in the parent-hello message, chained breadcrumb (`archify:bundle-crumb`), the generalized
Escape/Backspace ladder, and the session/`requestId` fields added to every cross-frame message
type. Does **not** include: the `html[data-bundle-nested="true"]` padding/margin block (→ commit
3), anything under `Archify.dive` or the `Z`-toggle keydown branch (→ commit 5), anything in
`viewer-camera.js`'s embedded fragment (there is none to change here — camera edits live in
`viewer/viewer-camera.js` itself, pulled in by the generator, not hand-edited in this file).
- `archify/assets/template.html` (generated; must land in the SAME commit — `check:viewer` fails
  on any drift between source and generated output)
- `archify/bin/visual-check.mjs` — hunk-split: only the `extraArgs`/`chromeVisualBrowserArgs`
  addition (backward-compatible optional constructor/function param; nothing else in this file
  changed for this work)
- `archify/test/drilldown-browser.test.mjs`, `drilldown-keyboard.test.mjs`
- `archify/test/drilldown-nested-browser.test.mjs` (new — three-level descend/ascend, the real
  OS-level keyboard Escape test using the new `extraArgs`-enabled Chrome launch, the `file://`
  three-level test)

### 3. `chore(viewer): compress nested-child chrome padding (CSS only)`

**`viewer/template.source.html` — hunk-split**: only the four `html[data-bundle-nested="true"]`
rules (`.header{padding-right:0}`, `body{padding-inline:...}`, `.header-row{margin-bottom:...}`,
`.diagram-container{padding:...}`) added just above the existing `svg
[data-node-id][data-locate-inside]...` block. Pure CSS, no behavior change.
- `archify/assets/template.html` (generated; same-commit requirement as commit 2)

### 4. `chore: rebuild generated artifacts for PR1 (recursive bundles + descend + nested CSS)`

PR1's own artifact rebuild — **built from PR1's head only**, before any PR2 content exists, so
this commit's outputs never carry camera/dive bytes. Mirrors `be5fd7c`'s shape.

- `archify.zip` (`scripts/build-zip.sh`, Node 22)
- `examples/dataflow-product-analytics.html`, `lifecycle-agent-run.html`,
  `sequence-cache-miss-request.html`, `web-app-rendered.html`, `web-app.html`,
  `workflow-agent-tool-call-rendered.html`, and the same five under `archify/examples/`
  (`npm run render:examples`, run with the default output root AND with `../examples` — the
  package.json script only covers the latter)
- `examples/checkout-platform-delta.html`, `checkout-platform-delta.receipt.json`
  (`archify compare architecture`, `architecture-delta.test.mjs`'s own command)
- `docs/gallery.html`, `docs/gallery/manifest.json`, `docs/gallery/artifacts/*.html`
  (`npm run build:gallery`)
- `docs/assets/archify-live-proof.gif`, `archify-live-proof.json` (`npm run build:readme-showcase`;
  requires `ffmpeg`)

**Excluded, unverified — see PR1's own "Actual results/exceptions" section**: `docs/cases/
archify-self` (needs a checkout with `origin=tt-a1i/archify`) and `docs/cases/mco-runtime.*` /
`experiments/mco-showcase` (needs a local `mco-org/mco` checkout). Reproduced in the maintainer's
own environment, not here; **not confirmed to rebuild cleanly** — whoever runs this commit there
must actually do those two rebuilds and note the result, not assume it.

## PR2 branch (base: PR1's head, stacked)

### 5. `feat(viewer): cursor/pinch-anchored camera gestures and onChange`

- `viewer/viewer-camera.js` — whole file (wheel/pinch handlers, `minZoomOut`, `onChange`/
  `offChange`, `tickWheelGesture`; nothing here is shared with PR1)
- `archify/assets/template.html` — **regenerated from this commit too** (astra's correction: an
  earlier draft of this plan omitted this — `viewer-camera.js` is one of `generate-viewer.mjs`'s
  embedded fragments, so ANY change to it requires `npm run generate:viewer` and the `check:viewer`
  gate applies here exactly as it does to commit 2)
- `archify/test/viewer-wheel-browser.test.mjs` (new) — **the abandoned `settle()` rewrite is NOT
  part of this commit.** An earlier draft of this plan listed an `Archify.view.onChange`-based
  deterministic `settle()` as shipped here; a 2×2 bisect proved that rewrite itself caused a real
  test regression (not the product), so the file was reverted to its last-accepted (Faz 3a tur-3)
  state and that is what this commit actually contains. The determinism rewrite is explicitly
  **not** part of this plan; it is future work, tracked separately.

### 6. `feat(viewer): opt-in zoom-to-descend (dive)`

Depends on commit 5 (camera's `onChange`/`minZoomOut`) and PR1's commit 2 (`Archify.drilldown`).

- `viewer/dive.js` (new, whole file)
- `viewer/template.source.html` — **hunk-split from commit 2/3's PR1 content**: only the dive
  wiring — the `Z`-key branch in the shared keydown handler, `archify:dive-pref` message handling
  in the parent-message listener, the `data-dive-preview`/live-status-region markup, and the
  `/* ARCHIFY:DIVE */` marker comment itself.
- `scripts/generate-viewer.mjs` — hunk-split: only the `['/* ARCHIFY:DIVE */', 'dive.js']` entry
  added to the `fragments` array (one line; nothing else in this generator script changed for
  this work)
- `archify/assets/template.html` (generated; same-commit requirement)
- `viewer/export-cleanup.js` (dwell-preview selector excluded from the export filter)
- `viewer/README.md` (dive documented) — hunk-split if this file has other unrelated edits;
  otherwise whole-file
- `archify/renderers/shared/i18n.mjs` — hunk-split: only the new dive-related string keys
  (`viewer.dive.*`); nothing else in this shared i18n table changed for this work
- `archify/test/generate-viewer.test.mjs` — hunk-split: only the `f.dive` fixture-file addition to
  the existing all-fragments-round-trip test, and the `dive.js` source included in the existing
  "generated template never ships a literal NaN/Infinity token" guard test's scan list; the guard
  test itself predates this work and is not authored here
- `archify/test/drilldown-dive-browser.test.mjs` (new — repeat/SELECT/textbox guard, two
  independent redive-lock isolation tests, `dive-pref` session-channel + wrong-session-rejection
  + real storage-denial fault injection, dwell export byte-identity captured in one CDP call,
  live-status-region DOM test)
- `archify/test/fixtures/bundle-dive/` (new)

### 7. `chore: rebuild generated artifacts for PR2 (camera + dive)`

PR2's own artifact rebuild, on top of commit 4's PR1 baseline — same file list and commands as
commit 4, run again now that camera+dive are in the template. Same `archify-self`/`mco-runtime`
exclusion and same "not confirmed to rebuild cleanly in the maintainer's environment" caveat.

## Documentation, not "unrelated"

`README.md`/`README_EN.md`/`README_ZH.md` and `CHANGELOG.md` were flagged as "unrelated to this
work" in an earlier draft of this plan — astra's correction was right, and reading the actual
`git diff` on all four (done now) confirms it precisely:

- **`CHANGELOG.md`**: four new, cleanly separate bullets under `### Added`, each mapping 1:1 —
  "**N-depth drilldown bundles**" → commit 1; "**Recursive Viewer descend**" → commit 2;
  "**Wheel and pinch camera zoom**" → commit 5; "**Opt-in zoom-triggered drilldown descend
  ('dive')**" → commit 6. No nested-CSS bullet exists (commit 3's chrome-padding fix is
  CSS-only and wasn't considered CHANGELOG-worthy) and no unrelated bullets are mixed in — the
  whole diff is these four insertions.
- **`README.md`/`README_EN.md`/`README_ZH.md`**: identically shaped one-line diff in each — the
  keyboard-shortcuts table's "Zoom or reset" row gains `/wheel/pinch/`<kbd>Z</kbd>`-dive` after the
  existing `+`/`-`/`0`. This single line mentions both features on one row, so it cannot be
  hunk-split by `git add -p` (which operates on whole changed lines) between commits 5 and 6 as
  cleanly as the CHANGELOG bullets — the honest options are either (a) one commit changes the row
  to add `/wheel/pinch` only and a later commit further edits the same line to append
  `/`<kbd>Z</kbd>`-dive` (two real edits to the same line, sequenced with commits 5 and 6
  respectively — possible, just two small textual passes instead of one), or (b) accept this one
  row landing whole with commit 6 (dive), since dive is what actually completes the row's final
  text and camera-only readers would still see an accurate (if momentarily incomplete) `+`/`-`/
  `0`/wheel/pinch row after commit 5 alone. No part of any of these three files is unrelated to
  this work — the diff on each is exactly this one line.
