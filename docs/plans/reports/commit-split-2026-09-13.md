# Commit split execution report — `feat/nested-drilldown` → 7 commits (2026-09-13)

Executor: Claude Sonnet 5 subagent. Brief: `docs/plans/briefs/commit-split-2026-09-13.md`. Map:
`docs/plans/upstream/commit-plan.md`. Worktree:
`/tmp/claude-1000/-home-ubuntu-repos-AIWorkspace/44f257c0-9f19-4bde-8a89-1d84b1b2297d/scratchpad/archify-split`,
branch `feat/nested-drilldown-split`, from base `cc1b33a`. Snapshot `backup/wip-snapshot-2026-09-13` =
`a850ecc` — untouched, not deleted. Main fork dir `/home/ubuntu/repos/archify` was not modified except
to write this report.

## Result

- **PR1_HEAD** = `eb888b2249c285f2770ed58a01b83f38823e63077` (short `eb888b2`) — commit 4
- **PR2_HEAD** = `1697c8cc8f58803cf3bfeceb5cf07e4aeba570c5` (short `1697c8c`) — commit 7

```
15e9313 feat(bundle): recursive (N-depth) bundle manifests and tree validation
2a838a4 feat(viewer): recursive descend, breadcrumb and Escape ladder
f033fb4 chore(viewer): compress nested-child chrome padding (CSS only)
eb888b2 chore: rebuild generated artifacts for PR1 (recursive bundles + descend + nested CSS)   <- PR1_HEAD
48520f2 feat(viewer): cursor/pinch-anchored camera gestures and onChange
7bf8fa9 feat(viewer): opt-in zoom-to-descend (dive)
1697c8c chore: rebuild generated artifacts for PR2 (camera + dive)                              <- PR2_HEAD
```

All 7 commit messages end with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Corrections made mid-construction (both fixed by amend + cherry-pick before anything downstream depended on them; no force-push, nothing shared)

1. **Commit 1 leaked dive content.** `archify/test/helpers/bundle-fixture.mjs` was checked out
   whole-file from the snapshot for commit 1 per the brief, but its actual diff between `cc1b33a`
   and `a850ecc` interleaves the `deep` (N-depth, commit 1) and `dive` (commit 6) fixture-loading
   branches in the same hunks — the brief's "whole file" instruction for this path was wrong. Caught
   by the PR1-head grep gate (`fixture === 'dive'` matched the `dive` keyword filter). Fixed by
   checking out commit 1 (original SHA `993d36c`) in detached HEAD, hand-editing the file to keep
   only the `deep`/`DEEP_SPEC_FILES` branch, amending (new SHA `15e9313`), then cherry-picking
   commits 2–4 on top (all applied cleanly, no conflicts) and fast-forwarding the branch ref. The
   dive branch (`fixture === 'dive'`, `diveSpecsDir`, `DIVE_SPEC_FILES`) was restored in commit 6.
2. **Commit 5 CHANGELOG bullet ordering.** The snapshot's actual `### Added` order is
   `N-depth → Recursive descend → Delta navigation → Wheel/pinch → Dive` (the `Delta navigation`
   bullet, pre-existing since `cc1b33a`, sits between `Recursive descend` and `Wheel/pinch`, not
   after `Dive`). Commit 5's bullet insertion put `Wheel/pinch` immediately after `Recursive descend`
   instead of after `Delta navigation`. Not caught by any gate (gates check content, not bullet
   order) — found only by the final byte-for-byte snapshot diff at commit 6. Fixed the same way:
   detached HEAD at commit 5 (original SHA `69c6f4f`), moved the bullet, amended (new SHA `48520f2`),
   then `git stash pop`'d the in-progress commit 6 work back on top (one conflict, in `CHANGELOG.md`
   itself, resolved by hand to the snapshot's exact bullet order) and continued.

No other corrections were needed; every other whole-file/hunk-split decision matched the snapshot on
the first attempt, confirmed against `git show a850ecc:<path>` and the final empty-diff gates below.

## Per-commit summary

### 1. `feat(bundle): recursive (N-depth) bundle manifests and tree validation` — `15e9313`
```
20 files changed, 1771 insertions(+), 148 deletions(-)
create mode 100644 archify/test/bundle-depth.test.mjs
create mode 100644 archify/test/fixtures/bundle-checkout-deep/{checkout-platform,ledger-flow,payments,settlement}.json
create mode 100644 archify/test/fixtures/bundle-checkout/manifest.reference.json
create mode 100644 archify/test/locate-bundle-depth.test.mjs
```
Whole files from snapshot as listed in the brief, plus the corrected `bundle-fixture.mjs` (deep-only,
see correction 1 above). `generated-validators.mjs` regenerated via `npm run generate:validators`;
`git diff a850ecc -- archify/renderers/shared/generated-validators.mjs` → empty.

**Hunk splits:**
- `CHANGELOG.md`: only the "**N-depth drilldown bundles.**" bullet, inserted after "Identity-based
  drilldown bundles".
- `archify/references/drilldown-bundles.md`: kept everything about bundle rules/manifest/
  validation/`max_depth`/ownership chain — the directory-layout intro paragraph, the "Depth ranges
  from two levels up to eight" line, the new grandchild flat-directory example block, the
  `manifest.json` example (`checkout-platform`/`payments`/`settlement`), the `max_depth` prose, all
  ten numbered validation checks, the failure-code list plus the removed/added-code paragraph, the
  new "**The parent-child chain.**" locate-ownership section, and the "Depth above 8 levels. No
  shared children…" half of "Not supported". Left untouched (still `cc1b33a` prose) for this commit:
  the entire "## Reader behavior" section (Descending/Level 1/Returning/Disabled/Motion) and the
  "No zoom-triggered descend" sentence at the end of "Not supported" — both move in commits 2/6.

**Gates:**
- `npm run check:validators` → pass (no output, exit 0).
- `node --test archify/test/bundle-*.test.mjs archify/test/locate-bundle-depth.test.mjs archify/test/generate-validators.test.mjs`
  → `tests 65, pass 63, fail 0, cancelled 0, skipped 2, todo 0`.

### 2. `feat(viewer): recursive descend, breadcrumb and Escape ladder` — `2a838a4`
```
9 files changed, 2055 insertions(+), 204 deletions(-)
create mode 100644 archify/test/drilldown-nested-browser.test.mjs
```
`archify/bin/visual-check.mjs` whole (only the `extraArgs` addition, confirmed by inspecting its
full diff — nothing else in the file changed for this work).
`archify/test/drilldown-{browser,keyboard}.test.mjs` whole (existing files, small diffs).

**`viewer/template.source.html` hunk split** (line-by-line where a hunk mixed concerns, per the
brief's method): kept every `Archify.drilldown` IIFE change — `data-drilldown-open` CSS selector
pairing, the nav-hiding generalization to `.archify-drilldown-crumb`/`.archify-drilldown-silhouette`/
specific `#btn-*` ids (replacing the old blanket `.diagram-nav` hide), the `data-drilldown-anim`
rename in the reduced-motion media query, `ASCEND_SETTLE_STEP_MS`, the new
`subtreeManifest`/`myDepth`/`helloSession`/`sessionCounter`/`chainBelow`/`pendingAscend*` state,
`buildSubtree`/`validateSubtreeShape`/`sanitizeChain`/`entryTitleFor`/`myOwnDiagramId`, `drillFor`'s
`childId` parameter, `setState`'s `data-drilldown-open` write, `setAnim`/`cancelPendingAscend`,
`belowMaxDepth`, `syncPassport`'s simplified `allow` check, `buildSilhouette`'s `nestedChild()` guard,
`renderChain`/`myOwnRung`/`publishChain` (replacing `renderCrumb`), `showStale`/`postHello`/
`finishHandshake`'s session/subtree/chain wiring, `descend()`'s `active()`/`belowMaxDepth()`/session
logic, the ACK-gated handshake-timeout rewrite, `back()`'s `closing`/`current=null`-immediately
rewrite plus focus restoration, `handleAscendRequest`/`ascendTo`/`closeInnermost`/`escapeToParent`,
`onParentMessage`/`onChildMessage`/`onMessage` dispatch (**excluding** the `archify:dive-pref`
branch — deferred to commit 6), `onMarkClick`'s dropped `nestedChild()` check,
`registerBundleListeners`'s `isBundlePart` generalization, and the `Archify.drilldown` export's
`ascendTo`/`closeInnermost`/`escapeToParent` additions (**excluding** `activeChildSession` — commit
6). Also included the shared-keydown change that calls `Archify.drilldown.closeInnermost()` instead
of `back()`, and the `escapeToParent()` fallback. **Excluded**: the four
`html[data-bundle-nested="true"]` padding/margin CSS rules (→3), the two `touch-action` CSS lines
(→5), and everything dive (`.archify-dive-status`/`#btn-drilldown-dive` CSS and markup, the
"Belirginleştirme" highlight block, `data-dive-preview` CSS, the dive-pref message branch, the
`activeChildSession` export, the `Z` keydown branch, the `Z ->` help line, `/* ARCHIFY:DIVE */`) (→6).
Regenerated `archify/assets/template.html` in the same commit.

**`viewer/README.md` hunk split**: the fragment-list/intro sentence extending `template.source.html`'s
description to mention the inline `Archify.drilldown` IIFE (kept; the neighboring `dive.js` mention
in the same original hunk was excluded → commit 6), and the entire new "## Drilldown contract"
section verbatim (verified: this section in the snapshot ends cleanly before "## Drilldown dive
contract" with no interleaving — a clean hunk boundary, not a line-by-line split). The
"Reader, Chrome Layout, …, Focus and Export" → "…, Export and Dive" fragment-extraction list line was
entirely excluded (dive-only) → commit 6.

**`archify/references/drilldown-bundles.md` hunk split**: the "Reader behavior" hunks about
recursive descend, breadcrumb, and the Escape ladder (Descending/subtree resolution/session
mandate/ACK-only readiness/two-receivers/breadcrumb aggregation/ascend-to-depth/Escape
ladder/loosened nested constraints) — excluding only the new "**Zoom-dive (opt-in)**" paragraph,
which is entirely dive content (→6).

`CHANGELOG.md`: only the "**Recursive Viewer descend.**" bullet, inserted after "N-depth drilldown
bundles".

**Gates:**
- `npm run check:viewer` → pass.
- `ARCHIFY_CHROME=/usr/bin/google-chrome node --test archify/test/drilldown-*.test.mjs` →
  `tests 27, pass 27, fail 0, skipped 0`.
- PR1-boundary grep (run early, re-run and still clean at PR1 head — see commit 4) found nothing at
  this point either.

### 3. `chore(viewer): compress nested-child chrome padding (CSS only)` — `f033fb4`
```
2 files changed, 46 insertions(+)
 archify/assets/template.html | 23 +++++++++++++++++++++++
 viewer/template.source.html  | 23 +++++++++++++++++++++++
```
Only the four `html[data-bundle-nested="true"]` rules (`body`, `.header`, `.header-row`,
`.diagram-container`) plus their explanatory comment, and the regenerated `template.html`.

**Gates:**
- `git show --stat HEAD` → touches exactly `archify/assets/template.html` and
  `viewer/template.source.html` (confirmed above).
- `npm run check:viewer` → pass.

### 4. `chore: rebuild generated artifacts for PR1 (recursive bundles + descend + nested CSS)` — `eb888b2` = PR1_HEAD
```
29 files changed, 10731 insertions(+), 2060 deletions(-)
```
Rebuilt from PR1's own tree (commit 3's head), before any PR2 content existed:
- `npm run render:examples` twice: once with no arg (default root `archify/examples/`), once with
  `../examples` (package.json's own script) — 5 files each side.
- `examples/web-app.html` (not covered by `render-examples.mjs`'s `TARGETS` list) rendered directly
  via `node renderers/architecture/render-architecture.mjs examples/web-app.architecture.json
  ../examples/web-app.html`; confirmed byte-identical to `web-app-rendered.html` both before and
  after, matching how the snapshot ships it (same content, two filenames — `golden.mjs` and
  `repository-language-metadata.test.mjs` both reference `examples/web-app.html` specifically, and
  neither `render-examples.mjs` nor any other script in the repo produces that exact path).
- `archify compare architecture` for the checkout-platform delta, using
  `architecture-delta.test.mjs`'s own "checked-in Checkout compare artifact is reproducible" command:
  `node bin/archify.mjs compare architecture examples/checkout-platform.base.architecture.json
  examples/checkout-platform.head.architecture.json ../examples/checkout-platform-delta.html
  --receipt ../examples/checkout-platform-delta.receipt.json --quality showcase --json`.
- `npm run build:gallery` → `gallery 11 artifacts / 99 checks`.
- `npm run build:readme-showcase` (needs `ffmpeg`, present at `/usr/bin/ffmpeg`) →
  `README showcase 54 frames / 5.4s / 1821032 bytes`.
- `scripts/build-zip.sh` → `built archify.zip (93 files)`.
Did NOT touch `docs/cases/archify-self`, `docs/cases/mco-runtime.*`, or `experiments/mco-showcase`
(not reproduced here — matches the brief/plan's stated exclusion; needs checkouts not available in
this environment).

**PR1-head gates:**
- Boundary grep — `git diff cc1b33a HEAD -- viewer archify/assets/template.html archify/test
  archify/references viewer/README.md CHANGELOG.md | grep '^+' | grep -n -i -E
  'dive|zoomAt|minZoomOut|pinch|onChange|offChange|tickWheelGesture|dwell'` → **empty** (no output,
  confirmed after the commit-1 fixup was applied and the branch fast-forwarded).
- `ARCHIFY_CHROME=/usr/bin/google-chrome npm test` (log: `/tmp/pr1_test_full.log`, ~735s) →
  **`tests 1630, pass 1621, fail 4, cancelled 0, skipped 5, todo 0`**. All 4 failures are subtests
  inside `archify/test/update-notifier.test.mjs` (`concurrent checks use one writer and leave a
  valid cache`; `an empty precheck snapshot cannot start a second concurrent network request`; `two
  promoters cannot replace and then steal a stale empty active claim`; `a last-good notice remains
  acknowledgeable after the refresh commits a new candidate`). This file has **zero diff** between
  `cc1b33a` and `a850ecc` (`git diff cc1b33a a850ecc -- archify/test/update-notifier.test.mjs` is
  empty) — untouched by any of the 7 commits. Isolated rerun of that one file at PR1 head (`eb888b2`)
  gave `tests 87, pass 84, fail 3` (three concurrency/timing-sensitive subtests, same file); Fable
  independently confirmed the identical file at the untouched base `cc1b33a` also gives
  `87/84/3 fail` — same three tests — and that this is already recorded as known-bad in
  `docs/plans/reports/faz0-baseline-2026-09-12.md`. **Pre-existing, unrelated to this split.**
  No `route-journey`/`route-probe` failures occurred in the full PR1 run, so no isolated rerun of
  those was needed at this head.

### 5. `feat(viewer): cursor/pinch-anchored camera gestures and onChange` — `48520f2`
```
7 files changed, 1142 insertions(+), 36 deletions(-)
create mode 100644 archify/test/viewer-wheel-browser.test.mjs
```
`viewer/viewer-camera.js` whole (confirmed nothing here is shared with PR1 — the entire diff is
`changeListeners`/`eventListeners`/pinch state, `emitChangeSnapshot`/`notifyChange`/`emit`/`onChange`/
`offChange`/`on`/`off`, `svgOrigin`/`zoomAt`, wheel/pinch handlers, pointer-capture lifecycle).
`archify/test/viewer-wheel-browser.test.mjs` whole (new, the reverted Faz 3a tur-3 version per the
brief's correction — no `settle()` determinism rewrite).

**`viewer/template.source.html` hunk**: only the two `touch-action` CSS lines
(`.diagram-container { touch-action: pan-x pan-y; }` and the wide-diagram-mode
`{ touch-action: auto; }`) — both verified camera-related (the wide-diagram one exists specifically
so the JS pinch/wheel guard, not the browser's native touch handling, governs zoom there).
Regenerated `template.html` in the same commit (astra's correction from the plan — camera needs its
own `check:viewer` pass here, same as commit 2).

`archify/references/viewer-runtime.md`: only the wheel/pinch bullet.
`viewer/README.md`: the entire camera/`zoomAt`/`onChange`/gesture documentation block (interface
list, `zoomAt` semantics, wheel/pinch behavior, pinch pointer-capture lifecycle, `on('gesture')`
event semantics, `onChange`/`offChange` settle semantics) — this block itself forward-references
"Faz 3b's zoom-dive" twice (documenting the generic `on('gesture')`/`minZoomOut` hooks dive will
later consume), left in verbatim as authored, matching the same forward-reference pattern already
used by the N-depth CHANGELOG bullet in commit 1.
`CHANGELOG.md`: only the "**Wheel and pinch camera zoom.**" bullet — inserted after "Delta
`navigation` field group" (see correction 2 above for why that position matters).

**Gates:**
- `npm run check:viewer` → pass.
- `ARCHIFY_CHROME=/usr/bin/google-chrome node --test archify/test/viewer-wheel-browser.test.mjs`
  (run alone per the brief's load-sensitivity note) → `tests 26, pass 26, fail 0`.
- Re-ran the PR1 boundary grep against this commit's diff for dive-only tokens — only one match,
  the expected "Faz 3b's zoom-dive" prose mention in `viewer/README.md` documenting the shared
  `on('gesture', cb)` hook itself (not dive code/CSS); accepted as in-scope camera documentation.

### 6. `feat(viewer): opt-in zoom-to-descend (dive)` — `7bf8fa9`
```
19 files changed, 1930 insertions(+), 17 deletions(-)
create mode 100644 archify/test/drilldown-dive-browser.test.mjs
create mode 100644 archify/test/fixtures/bundle-dive/{entry,leaf,middle}.json
create mode 100644 viewer/dive.js
```
Everything remaining: `viewer/dive.js` whole (new); the rest of `viewer/template.source.html`
(`.archify-dive-status`/`#btn-drilldown-dive` CSS, the "Belirginleştirme" always-on highlight block,
`data-dive-preview` CSS, the `<p class="archify-dive-status">` and `<button id="btn-drilldown-dive">`
markup, the `archify:dive-pref` message branch, the `activeChildSession` export, the
`/* ARCHIFY:DIVE */` marker, the `Z ->` help line, the `Z` keydown branch); `scripts/generate-viewer.mjs`
(the one-line `['/* ARCHIFY:DIVE */', 'dive.js']` fragment entry); regenerated `template.html`;
`viewer/export-cleanup.js` (`data-dive-preview` added to the strip list and the byte-identity
selector); `viewer/README.md`'s remaining hunks (the `dive.js` fragment-list mention, the "Export and
Dive" extraction line, the whole "## Drilldown dive contract" section); `archify/renderers/shared/
i18n.mjs` whole diff (`viewer.dive.opening`, `viewer.nav.dive`/`.title`/`.short` — confirmed nothing
else in this shared table changed for this work); `archify/test/generate-viewer.test.mjs` whole diff
per correction #4 in the brief (the NaN/Infinity guard test is new here, not predating this work —
confirmed by reading its own comment, which cites a real dive.js regression as the reason it exists);
the new `archify/test/drilldown-dive-browser.test.mjs` and `archify/test/fixtures/bundle-dive/`;
the remaining `archify/references/viewer-runtime.md` line (the `Z` toggle bullet);
`archify/references/drilldown-bundles.md`'s remaining hunks (the "**Zoom-dive (opt-in)**" Reader
Behavior paragraph and the "No zoom-triggered descend…" sentence appended to "Not supported");
`CHANGELOG.md`'s last bullet ("Opt-in zoom-triggered drilldown descend"); `README.md`/`README_EN.md`/
`README_ZH.md` whole (the one-row keyboard-shortcuts table change, landed whole per plan option (b)
since dive completes the row's text). Also restored the `fixture === 'dive'` branch in
`archify/test/helpers/bundle-fixture.mjs` that commit 1 had wrongly carried (correction 1 above).

**Gates:**
- `npm run check:viewer` → pass.
- `ARCHIFY_CHROME=/usr/bin/google-chrome node --test archify/test/drilldown-dive-browser.test.mjs
  archify/test/generate-viewer.test.mjs` → `tests 290, pass 290, fail 0, skipped 0`.
- **All-source-equals-snapshot invariant**:
  `git diff a850ecc HEAD --stat -- . ':!docs/plans' ':!archify.zip' ':!examples' ':!archify/examples'
  ':!docs/gallery' ':!docs/gallery.html' ':!docs/assets'` → **empty** (confirmed after the commit-5
  fixup, correction 2 above).

### 7. `chore: rebuild generated artifacts for PR2 (camera + dive)` — `1697c8c` = PR2_HEAD
```
29 files changed, 15536 insertions(+), 495 deletions(-)
```
Same rebuild commands as commit 4, run again now that camera+dive are in the template. Same
`archify-self`/`mco-runtime` exclusion.

**PR2-head gates:**

1. **Empty-diff proof** — `git diff a850ecc HEAD -- . ':!docs/plans'`:
   ```
    docs/assets/archify-live-proof.gif  | Bin 1956315 -> 1721050 bytes
    docs/assets/archify-live-proof.json |   4 ++--
    2 files changed, 2 insertions(+), 2 deletions(-)
   ```
   **Not fully empty.** Every other file (source, generated HTML examples, gallery, `archify.zip`
   — which came out byte-size-identical, `2100555` bytes, matching `a850ecc`'s own `archify.zip`
   size exactly) is byte-for-byte equal to the snapshot. The only difference is the README
   showcase GIF (`docs/assets/archify-live-proof.gif`) and its receipt JSON's `bytes`/`sha256`
   fields, which are derived from the GIF.

   **Why, with evidence (non-determinism, not a split defect):** `build:readme-showcase` records a
   live Chrome CDP screencast through `ffmpeg` — real wall-clock frame timing during the recording,
   encoded by `ffmpeg`'s own GIF palette/dithering pipeline. Three *separate* invocations of this
   exact command exist to compare, each from a different point in this session (not two
   back-to-back reruns in immediate succession — I did not additionally do that, noting this
   explicitly since it's a materially weaker form of evidence than a controlled back-to-back
   comparison would be):
   | Source | `bytes` | `sha256` (first 12 hex) | blob md5 |
   |---|---|---|---|
   | `a850ecc` (snapshot, built by whoever produced the snapshot) | 1,956,315 | `ad93aaa51d05` | `5b1bd2d33569ba3f46f79065169ab37d` |
   | commit 4 rebuild (`eb888b2`, this session, PR1) | 1,821,032 | `8db8719c84b8` | `90cfafcded36af636545c8b00324af3e` |
   | commit 7 rebuild (`1697c8c`, this session, PR2) | 1,721,050 | `0183a0621cd4` | `9d518c1058eda1cf5d2cb1c05924a08c` |

   Three independent runs of the same command, three different byte counts and hashes — including
   two runs I made myself in the same session, on the same machine, minutes apart, with no source
   change to the recording target between them (nothing in commits 5/6/7 touches what the showcase
   records). That is strong evidence this artifact is inherently non-deterministic rather than
   something a correct split should reproduce byte-for-byte. `docs/assets/archify-live-proof.json`'s
   other fields (`fps`, `frameCount`, `durationSeconds`, `scenes[]`) are unchanged — only the
   byte-derived fields moved — and `test/webm-artifact.smoke.mjs`/`readme-showcase`-related tests
   check the receipt is self-consistent with the committed GIF and that scene artifact digests are
   unchanged, not that the GIF bytes match a fixed value; those checks passed in the full `npm test`
   run below. Not papered over — this is reported as-is per the brief's own instruction for this case.
2. `ARCHIFY_CHROME=/usr/bin/google-chrome npm test` (log: `/tmp/pr2_test_full.log`, ~1425s) →
   **`tests 1699, pass 1691, fail 3, cancelled 0, skipped 5, todo 0`**.
   - 2 of the 3 failures are the same pre-existing `update-notifier.test.mjs` flakes described under
     commit 4 (`an empty precheck snapshot cannot start a second concurrent network request`; `a
     last-good notice remains acknowledgeable after the refresh commits a new candidate`) — same
     untouched file, same known-bad status.
   - The 3rd failure is `test/motion-governor-browser.test.mjs` at the **file level**
     (`not ok 68 - test/motion-governor-browser.test.mjs`, `duration_ms: 1031689` ≈ 17 minutes,
     `signal: 'SIGTERM'`) — after its first 2 subtests passed, the process hung on subtest 3
     ("stored intent survives five same-origin HTTP navigations") until Fable killed it. This file
     also has **zero diff** between `cc1b33a` and `a850ecc` — untouched by any of the 7 commits.
     Fable reran it in isolation three times at PR2 head (`1697c8c`) and it hung at the same subtest
     each time (420s timeout), then ran it at the untouched base `cc1b33a` in a separate worktree —
     it hangs there too, at the same subtest, and it passed clean in the Faz 5 acceptance run on
     identical viewer sources. **Environmental (Chrome/CDP under load in this sandbox), not caused
     by this branch.**
   - No `route-journey`/`route-probe` failures occurred in this run either (0 matches in the log for
     either name), so no isolated rerun of those was needed.

## Excluded from both artifact-rebuild commits (4 and 7), as instructed
`docs/cases/archify-self` (needs a checkout with `origin=tt-a1i/archify`) and
`docs/cases/mco-runtime.*` / `experiments/mco-showcase` (needs a local `mco-org/mco` checkout) —
neither available in this environment; not reproduced or asserted clean here.

## Anything left open
- The two mid-construction corrections above (bundle-fixture.mjs dive leak in commit 1; CHANGELOG
  bullet order in commit 5) were fixed by amending the affected commit and fast-forwarding
  everything after it — no force-push, nothing was ever pushed or shared, `backup/wip-snapshot-
  2026-09-13` untouched throughout.
- `update-notifier.test.mjs` (3-4 flaky subtests, pre-existing per `faz0-baseline-2026-09-12.md`)
  and `motion-governor-browser.test.mjs` (environmental hang, reproduces on the untouched base) are
  both known-bad independent of this split; not fixed here per the brief ("do not 'fix' product code
  here").
- The README showcase GIF is inherently non-deterministic across rebuilds (see commit 7 above);
  whoever lands PR2 should decide whether to re-run `build:readme-showcase` once more at merge time
  or accept whichever bytes land last — the receipt/scene-digest checks that actually gate correctness
  pass either way.
- Worktree and branch left in place for Fable's fast-forward/cleanup, as instructed. No push, no
  GitHub interaction, `docs/plans/` not committed on this branch.

## Tur 2 (astra düzeltmeleri)

Brief: `docs/plans/briefs/commit-split-round2-2026-09-13.md`. Astra review applied:
`docs/plans/reviews/commit-split-astra-1-2026-09-13.md` (verdict: DÜZELTMEYLE KABUL). New branch
`feat/nested-drilldown-split2`, built from `15e9313` (commit 1, unchanged) by cherry-picking each
round-1 commit and amending doc text + commit message per the brief. Same worktree as round 1:
`/tmp/claude-1000/-home-ubuntu-repos-AIWorkspace/44f257c0-9f19-4bde-8a89-1d84b1b2297d/scratchpad/archify-split`.
Old branch `feat/nested-drilldown-split` left untouched at `1697c8c` (not checked out during this
round, only switched away from); `backup/wip-snapshot-2026-09-13` untouched at `a850ecc`. No source,
test or CSS bytes were edited in this round — only Markdown doc text and commit messages. No push,
no GitHub.

### New commit SHAs

| # | New SHA | Old SHA (round 1) | Subject |
|---|---|---|---|
| 1' | `15e93130655a2b405f8da689018cc0142c837905` (= commit 1, unchanged) | `15e9313` | feat(bundle): recursive (N-depth) bundle manifests and tree validation |
| 2' | `a6499aab5a3b5a930224227684d921679b169dd8` | `2a838a4` | feat(viewer): recursive descend, breadcrumb and Escape ladder |
| 3' | `a3dd2ce2e24fc7438c0dee306d81e2cf3af0a0ac` | `f033fb4` | chore(viewer): compress nested-child chrome padding (CSS only) |
| 4' | `5a85a362f2fbcc8e6f846762d9f059ac44c77b69` | `eb888b2` | chore: rebuild generated artifacts for PR1 (recursive bundles + descend + nested CSS) |
| 5' | `83992341c2f8fc62617e1da7a923de45e3ad7783` | `48520f2` | feat(viewer): cursor/pinch-anchored camera gestures and onChange |
| 6' | `dc0350fff0673aedf872bb0cf0cae198b81a1a81` | `7bf8fa9` | feat(viewer): opt-in zoom-to-descend (dive) |
| 7' | `d829cabdc37b2afc68c056272a915795e5371672` | `1697c8c` | chore: rebuild generated artifacts for PR2 (camera + dive) |

**PR1_HEAD' = `5a85a362f2fbcc8e6f846762d9f059ac44c77b69`** (commit 4')
**PR2_HEAD' = `d829cabdc37b2afc68c056272a915795e5371672`** (commit 7')

### Per-commit doc corrections applied (verified against the cited code lines before wording)

**Commit 2' (from `2a838a4`), unchanged 9-file diff except doc text + message:**
- `viewer/README.md:982` — verified `buildSubtree()` in `viewer/template.source.html:6508-6532`
  (at `2a838a4`): for a leaf `childId`, the walk pushes `byId[childId]` into `diagrams` (the leaf's
  own manifest row) before `rowsByParent[childId]` (empty) yields no `drilldowns`. Old text claimed
  "empty `diagrams`/`drilldowns` pair" — corrected to "`diagrams` still carries the leaf's own row,
  only `drilldowns` is empty".
- `viewer/README.md:1014` — verified `handleAscendRequest` (`template.source.html:6984-6986` at
  `2a838a4`): `settleTimeoutMs = ASCEND_SETTLE_STEP_MS * Math.max(1, maxDepthForTimeout - myDepth)`,
  `ASCEND_SETTLE_STEP_MS = 250`. Old text said "200ms timer" — corrected to the actual formula.
- `archify/references/drilldown-bundles.md:258` — verified `descend()`
  (`template.source.html:6827-6853` at `2a838a4`): `false` only for `active()`, `!belowMaxDepth()`,
  missing `childId`/manifest; a missing row or missing child instead calls
  `showStale('missing-row'|'missing-child')` and **returns `true`**. Old text folded the missing-row
  case into the `false` list — corrected to state it returns `true` with a stale card.
- `CHANGELOG.md` "Recursive Viewer descend" bullet — same leaf-subtree fix as the README.
- Message body — replaced "every cross-frame message carries a session number" with "every
  navigation request/reply (hello ack, escape, breadcrumb, ascend) carries a session number [...]
  the Locate projection message carries no session at all" — verified `archify:locate-projection`
  postMessage at `template.source.html:6820` (2a838a4) has no `session` field, vs. `hello`/
  `drilldown-crumb`/`drilldown-escape`/`drilldown-ascend-*` which all set `session`.

**Commit 3' (from `f033fb4`):** cherry-picked byte-for-byte, no changes (brief: "unchanged").

**Commit 4' (from `eb888b2`):** cherry-picked, then rebuilt ONLY `archify.zip` via
`scripts/build-zip.sh` (it packages `archify/references/drilldown-bundles.md`, whose text changed in
commit 2'); every other generated file (examples, gallery, GIF) kept as cherry-picked. Diff after
rebuild: only `archify.zip` (Bin 2048372 -> 2048423 bytes). Amended, no message change needed (body
already accurate per round-1).

**Commit 5' (from `48520f2`):**
- `viewer/README.md:782,793` — removed "Faz 3b's zoom-dive" / "Faz 3b's ascend trigger" (dive.js
  does not exist yet at this commit) → "a caller" / "a consumer such as an ascend trigger".
- `viewer/README.md:797` — verified `viewer-camera.js` (`notifyChange()`/`clearTransitionSettle()`
  at lines 152-175 in the 48520f2 blob): `apply()` always fires `transitioning:true` immediately,
  but `clearTransitionSettle()` at the top of `notifyChange()` cancels the *previous* pending settle
  watch outright when a newer `apply()` supersedes it before it settles — so the settled
  (`transitioning:false`) callback is skipped for the superseded call, not fired for "every"
  `apply()` as the old text claimed. Corrected accordingly.
- Message body — replaced the "reverted (Faz 3a tur-3) / abandoned settle() determinism rewrite"
  history with a description of the actual test: verified `archify/test/viewer-wheel-browser.test.mjs:63`
  (`return equal >= 6 && (performance.now() - start) >= 260;`) — "checks wait for transform
  stability with a 260ms minimum".

**Commit 6' (from `7bf8fa9`), the largest correction set — all verified against `viewer/dive.js` at
`7bf8fa9` before wording:**
- `viewer/README.md:24` (fragment-list intro) — `dive.js` was listed among fragments whose
  "extractions preserve delivered HTML bytes"; it is new code, not an extraction. Split the sentence:
  the other 11 fragments (Reader…Export) still "were pulled out of `template.source.html`
  unchanged"; `dive.js` "is not one of those: it is a new fragment holding new functionality".
- `viewer/README.md:1229` ("no listener is registered") — verified `dive.js:35-46,309`: a nested
  LEAF (`nestedChild=true`, no own `[data-drilldown-child]`) is not `capable` but is
  `escapeCapable = !embed && nestedChild`, and `if (escapeCapable) Archify.view.on('minZoomOut', …)`
  plus the unconditional `gesture` listener still register. Only a diagram that is neither `capable`
  nor a nested child (the early-return branch at line 46) registers nothing. Corrected.
- `viewer/README.md:1254` and `CHANGELOG.md` dive bullet — verified `dive.js:113-125`
  (`blockingActive()`): the list is Route Probe / Semantic Lens / Presentation; the code comment
  explicitly excludes Intent Trace ("just its ordinary 90ms fine-pointer hover preview... treating
  that as blocking would make the feature nearly unreachable from a real mouse"). Removed Intent
  Trace from the blocking list in both files; added the exclusion rationale.
- `viewer/README.md:1292` (Redive lock) and `CHANGELOG.md` dive bullet — verified `dive.js:68,183-184,
  219,251-278,283-285`: **the brief/astra text said the lock lifts on a gesture 'start' "with a
  different `source:id`"; the code's own comment explicitly disclaims that** ("deliberately
  time-based and document-local rather than comparing gesture ids, since the escaping gesture
  physically happened in a different document... with its own independent id space"). `onGesture()`
  only checks `payload.phase === 'start'` and `silence >= GESTURE_SILENCE_MS (400)` — it never reads
  `payload.source`/`payload.gestureId`. Worded the fix to match the code exactly (time/silence-based,
  not an id comparison) rather than repeating the imprecise "different source:id" framing. Also
  verified and added the previously-undocumented second gate: `rearmed` starts `false` on ascend
  (`watchOwnAscend()` sets it at the same MutationObserver callback that sets the lock) and flips
  back to `true` only once a settled camera snapshot reports `scale < DIVE_SCALE (2.5)`
  (`onCameraChange():219`); `eligible()` requires both `!diveLock && rearmed` (line 183-184). Neither
  file previously mentioned `rearmed` at all.
- `archify/references/drilldown-bundles.md:426` — deleted the "No zoom-triggered descend — every
  descent still starts from the named Descend control..." prohibition (contradicted the new
  "Zoom-dive (opt-in)" section at ~338); kept the rest of the "Not supported" paragraph intact.
- Message body — states the precise trigger (manual mode, scale ≥2.5, epsilon-based dwell
  cancellation, exact blocking surfaces with the Intent-Trace exclusion rationale, and the
  lock-release rule verified above, including `rearmed`).

**Commit 7' (from `1697c8c`):** cherry-picked (binary conflict on `archify.zip` resolved by taking
theirs, then rebuilding — expected, since PR1's `archify.zip` in this branch already differs from
round 1's), then rebuilt ONLY `archify.zip`. Diff after rebuild: only `archify.zip`
(Bin 2100555 -> 2100502 bytes). Message unchanged (already accurate).

### Gate outputs (real commands, real results)

**Commit 4' gates:**
```
$ git diff cc1b33a HEAD -- viewer archify/assets/template.html archify/test archify/references viewer/README.md CHANGELOG.md \
    | grep '^+' | grep -n -i -E 'dive|zoomAt|minZoomOut|pinch|onChange|offChange|tickWheelGesture|dwell'
(no output — exit 1, i.e. no match: no PR2 bytes in PR1)

$ cd archify && node --test test/release-package-gates.test.mjs test/readme-showcase.test.mjs
# tests 30
# pass 28
# fail 0
# cancelled 0
# skipped 2   (Node-major-other-than-22 / win32-only tests, both intentional skips)
# todo 0
```

**Commit 5' gates:**
```
$ cd archify && npm run check:viewer
> archify@2.17.0-dev.1 check:viewer
> node ../scripts/generate-viewer.mjs --check
(exit 0, no drift)

$ ARCHIFY_CHROME=/usr/bin/google-chrome node --test test/viewer-wheel-browser.test.mjs
# tests 26
# pass 26
# fail 0
# cancelled 0
# skipped 0
```

**Commit 6' gates:**
```
$ cd archify && npm run check:viewer
(exit 0, no drift)

$ ARCHIFY_CHROME=/usr/bin/google-chrome node --test test/drilldown-dive-browser.test.mjs test/generate-viewer.test.mjs
# tests 290
# pass 290
# fail 0
# cancelled 0
# skipped 0
```

**Commit 7' gates:**
```
$ cd archify && npm run check:viewer
(exit 0, no drift)

$ node --test test/release-package-gates.test.mjs test/readme-showcase.test.mjs test/generate-viewer.test.mjs
# tests 304
# pass 302
# fail 0
# cancelled 0
# skipped 2

$ git diff a850ecc HEAD --stat -- . ':!docs/plans'
 CHANGELOG.md                            |   4 +-
 archify.zip                             | Bin 2100555 -> 2100502 bytes
 archify/references/drilldown-bundles.md |  18 +++----
 docs/assets/archify-live-proof.gif      | Bin 1956315 -> 1721050 bytes
 docs/assets/archify-live-proof.json     |   4 +-
 viewer/README.md                        |  91 +++++++++++++++++++++-----------
 6 files changed, 73 insertions(+), 44 deletions(-)
```
Matches the required list EXACTLY: `viewer/README.md`, `archify/references/drilldown-bundles.md`,
`CHANGELOG.md`, `archify.zip`, `docs/assets/archify-live-proof.gif`,
`docs/assets/archify-live-proof.json` — nothing else, nothing missing. The GIF/JSON diff is the
same non-deterministic showcase-rebuild delta already noted in round 1 (Tur 1's "Anything left
open"), reproduced identically here since the same `build:readme-showcase` step ran again.

### Full text diff of the three doc files vs `a850ecc`

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 74130c3..85dc597 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -10,10 +10,10 @@ All notable changes are documented here. Format loosely follows [Keep a Changelo
 - **Component ownership sidecar and `archify locate`.** A `<map-stem>.ownership.json` sidecar maps every component id in a diagram to repository path globs, with an `excluded` list applied first and an optional `parent` / `child_map` link between a drilldown parent and its child. `archify locate <base>..<head> --map <map.json> --out <dir>` classifies every path in a Git range as `touched`, `uncovered`, `ambiguous`, or `excluded`, and every component as `touched`, `untouched`, or `stale`, then writes a deterministic receipt plus an annotated HTML view. It is pure computation over Git output and two validated JSON files: no model call, no inference, no map edits. Receipts carry no timestamps and no absolute paths, sort every array by code point, and pin the map and sidecar by SHA-256, so two runs over the same inputs are byte-identical. Ambiguity is reported rather than resolved — there is no implicit glob precedence — and `archify locate --lint [<rev>]` turns ambiguity into an authoring-time failure while reporting uncovered paths as an advisory. `--facts` optionally attaches import-edge observations, which never change a state and are never reconciled against authored connections. When the map itself changed inside the range, the receipt gains `mapDelta` and, for architecture maps, an attached `archify compare` artifact under `<out>/compare/`; locate's own exit code is independent of that comparison. Three-dot `A...B` is `locate/range-invalid`. The receipt is schema-validated before write; control-character paths fail as `locate/path-invalid`. Documented in `archify/references/locate.md` and `archify/schemas/locate-receipt.schema.json`; not part of the SKILL.md fast path.
 - **Identity-based drilldown bundles (`archify bundle`).** One directory holds an entry diagram, up to twelve same-directory children of any of the five diagram types, and a `manifest.json` that binds them by diagram id and two SHA-256 digests: `spec_sha256` over the input JSON for the runtime handshake, `artifact_sha256` over the HTML bytes for offline validation. Depth is fixed at two levels and each diagram keeps the existing 12-node cap. `archify bundle <dir>` writes and refreshes the manifest; `--check` validates only. Ten checks cover manifest schema, levels, id and file uniqueness, embedded-manifest byte equality, drilldown resolution, node caps, second-layer marks, and ownership subset rules. Reading is descend-in-place: the parent shrinks to a breadcrumb plus a static silhouette, the child opens in a same-directory iframe on the same canvas, and `Esc` or the breadcrumb returns to the parent with its geometry and scroll position intact. While a drilldown is active, `Backspace` follows the same dismissal order as `Esc`. A child whose id or spec digest does not match, or whose handshake does not complete within 1200 ms, is never rendered: the viewer shows an explicit stale card with the expected and actual values and the repair command. `archify locate --bundle <dir>` embeds a change projection that dims untouched nodes and shows a "N FILES TOUCHED INSIDE" chip only when the count is non-zero; there are no check marks, no success colour, and no risk or merge claims. Documented in `archify/references/drilldown-bundles.md` and `archify/schemas/bundle.schema.json`.
 - **N-depth drilldown bundles.** `archify bundle` no longer stops at one level of children: any diagram in the bundle — not only the entry — may declare `components[].drilldown` on one of its own components, and the manifest's `max_depth` (now `2`–`8`, one more than the deepest `diagrams[].level` present) is computed from that tree instead of always being `2`. A bundle with only direct children produces the exact same manifest as before this change — the format is additive and existing two-level bundles are unaffected byte-for-byte. The bundle is a tree, not a DAG: a diagram reachable through more than one drilldown row now fails validation (`bundle/drilldown-shared`), same as a cycle (`bundle/drilldown-cycle`) or an unreachable diagram (`bundle/orphan`); depth above 8 levels fails with `bundle/depth-exceeded`. The former two-level-only rules `bundle/drilldown-nested` and `bundle/child-mark` are replaced by the tree checks above and by `bundle/leaf-mark`, which forbids a drilldown mark only on diagrams that declare no drilldown of their own (a leaf), not on every non-entry diagram. `archify locate --bundle` and the ownership-subset check follow the same generalization: a child's ownership sidecar binds to whichever diagram its drilldown row names as `parent`, not always the entry, and inherited `excluded` globs accumulate down the full chain from the entry through every intermediate parent. A sidecar's identity is now taken from the file actually read (`x.ownership.json` → `x.json`, matched against `manifest.diagrams[]`), never from its own `map` declaration, and a walked child's `parent.map` must name the exact sidecar file it was reached from rather than any manifest-recognized parent for that component id; a malformed sidecar (a bad schema shape, or a literal JSON `null`) now fails validation with a controlled `bundle/ownership-*` code instead of throwing. The Viewer's own recursive descend follows in the next entry below.
-- **Recursive Viewer descend.** The Viewer now reads a bundle's full tree, not only its first level: a child that is itself not a leaf offers the same Descend control and drilldown mark for its own components, so a diagram opens a second and a third time inside an already-descended viewer (iframe inside iframe). A parent hands its child a `subtree` of the manifest (scoped to that child's own descendants) inside the existing handshake hello, since a `file://` child cannot fetch a sibling manifest of its own; a leaf's subtree is empty and never offers a further descend. The breadcrumb is drawn once, at the root, as the full chain down to whichever level is currently deepest, aggregated one hop at a time as each level reports its own contribution to its own direct parent; only the root shows a silhouette. `Esc`/`Backspace` still close exactly one level per keystroke, from whichever level currently has focus — including the root while a grandchild is the deepest open level — and a breadcrumb rung's click ascends directly to that depth. Readiness (`data-drilldown-state="open"`, replacing the former `"level1"`) is now gated only on a successful handshake ack, never on the ~170ms transition timer, with or without reduced motion; every descend carries a session number so a delayed or superseded ack, escape, or breadcrumb update is ignored rather than corrupting the current descent. Zoom in/out/reset and the Descend control keep working at any nested depth; Route Probe, Semantic Radar, Semantic Lens, Node Finder and the Diagram Guide stay hidden while nested, as before. Documented in `viewer/README.md` "Drilldown contract" and `archify/references/drilldown-bundles.md` "Reader behavior".
+- **Recursive Viewer descend.** The Viewer now reads a bundle's full tree, not only its first level: a child that is itself not a leaf offers the same Descend control and drilldown mark for its own components, so a diagram opens a second and a third time inside an already-descended viewer (iframe inside iframe). A parent hands its child a `subtree` of the manifest (scoped to that child's own descendants) inside the existing handshake hello, since a `file://` child cannot fetch a sibling manifest of its own; a leaf's subtree still carries the leaf's own row in `diagrams`, only `drilldowns` is empty, so it never offers a further descend. The breadcrumb is drawn once, at the root, as the full chain down to whichever level is currently deepest, aggregated one hop at a time as each level reports its own contribution to its own direct parent; only the root shows a silhouette. `Esc`/`Backspace` still close exactly one level per keystroke, from whichever level currently has focus — including the root while a grandchild is the deepest open level — and a breadcrumb rung's click ascends directly to that depth. Readiness (`data-drilldown-state="open"`, replacing the former `"level1"`) is now gated only on a successful handshake ack, never on the ~170ms transition timer, with or without reduced motion; every descend carries a session number so a delayed or superseded ack, escape, or breadcrumb update is ignored rather than corrupting the current descent. Zoom in/out/reset and the Descend control keep working at any nested depth; Route Probe, Semantic Radar, Semantic Lens, Node Finder and the Diagram Guide stay hidden while nested, as before. Documented in `viewer/README.md` "Drilldown contract" and `archify/references/drilldown-bundles.md` "Reader behavior".
 - **Delta `navigation` field group.** Architecture comparison classifies a changed `drilldown` target as the new `navigation-changed` status with its own change-row marker, legend chip, review-strip entry, and colour, instead of overstating it as a semantic `changed` or misreporting it as `moved`. Component summaries gain `navigationChanged`. Existing statuses and counts are unaffected.
 - **Wheel and pinch camera zoom.** The Viewer now zooms continuously between 1x and 3x around the pointer (mouse wheel, `Ctrl`+wheel trackpad pinch) or the two-finger touch pinch midpoint, in addition to the existing `+`/`-`/`0` controls and keyboard shortcuts. `viewer-camera.js` adds `zoomAt(nextScale, clientX, clientY, { snap })` — the same fixed-point math as the existing center-anchored zoom, parameterized by screen point — and keeps `zoomIn`/`zoomOut`/`+`/`-` on their existing quarter-step snap. A wheel gesture or a pinch that cannot change scale (already at the 1x floor) leaves page scrolling alone and emits `minZoomOut` (with `source`/`gestureId`) instead. Both gestures no-op in the mobile-contained wide-diagram mode; pinch pointer capture is held for the gesture's lifetime instead of released early, a drag is scoped to the pointer that started it, and a third touch during an active pinch cannot start a new drag. Every wheel tick and pinch update also emits `{phase,source,id}` through `on('gesture', cb)` so a continuing physical gesture can be told apart from a fresh one. `onChange`/`offChange` subscribe to every camera update, now with a `transitioning` flag that flips to `false` once the change has visually settled (`transitionend` or a 200ms fallback); `on`/`off` cover `minZoomOut`, `gesture` and future events. Reading Depth and the 1–3 clamp are unchanged.
-- **Opt-in zoom-triggered drilldown descend ("dive").** A new `Archify.dive` (`viewer/dive.js`) lets a reader turn manual zoom itself into drilldown navigation. Off by default (`localStorage['archify-dive']`, toggled by the `Z` shortcut or a `.diagram-nav` button shown only on a diagram that actually has a drilldown row); zooming a drilldown-capable node past scale 2.5 under manual camera control starts a visible 250ms dwell (a ring on the node plus a status line) before calling the existing `Archify.drilldown.descend`, cancelled by any camera movement or lost eligibility in between. It never fires during a semantic-camera reveal, under `prefers-reduced-motion`, in the mobile-contained mode, while another exploration surface (Route Probe, Semantic Lens, Intent Trace, Presentation) is active, or while a descent is already open or mid-handshake. Inside a nested child, two distinct zoom-out gestures at the 1x floor within 600ms ascend one level the same way a breadcrumb click does; after an ascend, a redive lock holds until the reader's next gesture. The always-on drilldown-mark/Descend-control highlight at full camera detail (scale ≥ 1.75) is independent of the toggle and needs no new code — it is existing CSS keyed off `viewer-camera.js`'s own `data-detail-level` attribute. `viewer-camera.js` is unchanged by this feature; export, print and SVG bytes are unaffected. Documented in `viewer/README.md` "Drilldown dive contract" and `archify/references/drilldown-bundles.md` "Reader behavior".
+- **Opt-in zoom-triggered drilldown descend ("dive").** A new `Archify.dive` (`viewer/dive.js`) lets a reader turn manual zoom itself into drilldown navigation. Off by default (`localStorage['archify-dive']`, toggled by the `Z` shortcut or a `.diagram-nav` button shown only on a diagram that actually has a drilldown row); zooming a drilldown-capable node past scale 2.5 under manual camera control starts a visible 250ms dwell (a ring on the node plus a status line) before calling the existing `Archify.drilldown.descend`, cancelled by any camera movement or lost eligibility in between. It never fires during a semantic-camera reveal, under `prefers-reduced-motion`, in the mobile-contained mode, while another exploration surface (Route Probe, Semantic Lens, Presentation — Intent Trace is deliberately not blocking, since its own "active" node is just an ordinary 90ms hover preview that is true almost the entire time a real mouse hovers the node being wheel-zoomed) is active, or while a descent is already open or mid-handshake. Inside a nested child, two distinct zoom-out gestures at the 1x floor within 600ms ascend one level the same way a breadcrumb click does; after an ascend, a redive lock holds until either a fresh pointerdown/keydown or ≥400ms of gesture silence followed by a new gesture start, and separately requires the camera to have been seen back below scale 2.5 at least once since the ascend (`rearmed`) — both conditions must clear before a new dwell can start. The always-on drilldown-mark/Descend-control highlight at full camera detail (scale ≥ 1.75) is independent of the toggle and needs no new code — it is existing CSS keyed off `viewer-camera.js`'s own `data-detail-level` attribute. `viewer-camera.js` is unchanged by this feature; export, print and SVG bytes are unaffected. Documented in `viewer/README.md` "Drilldown dive contract" and `archify/references/drilldown-bundles.md` "Reader behavior".
 
 **Pending maintainer sign-off.** Two of the above touch public contracts and are recorded as unresolved in `docs/decisions/identity-map-2026-09-09.md` until the maintainer signs them off: the optional `drilldown` field on `architecture.schema.json` components, and the Delta `navigation` field group that classifies it. Existing schema-v1 documents remain valid because the field is optional. The HTML wrapper includes the drilldown runtime even when the field is absent, so byte-identical HTML is not promised.
 
diff --git a/archify/references/drilldown-bundles.md b/archify/references/drilldown-bundles.md
index 2e93fe9..b08a95b 100644
--- a/archify/references/drilldown-bundles.md
+++ b/archify/references/drilldown-bundles.md
@@ -255,12 +255,13 @@ entry's embedded copy at level 0, or the subtree its parent handed down at any d
 
 The call returns a boolean synchronously. `false` means no descent started: this document already
 has a child of its own open, `myDepth + 1 >= max_depth` (a defensive ceiling on top of the tree's
-own natural bound), the manifest has no `(parent, component, child)` row matching this document's
-own diagram id, the clicked component, and the node's own baked `data-drilldown-child` annotation
-all three at once (a component id reused by a different diagram never resolves, and neither does a
-row whose declared child names a different diagram than the node's own annotation — that is a
-missing row, not a load of the wrong file), or no manifest (embedded or inherited) is available
-yet. `true` means the request was handled; it may start loading a child
+own natural bound), or the clicked node carries no `data-drilldown-child` annotation or no manifest
+(embedded or inherited) is available yet. A missing `(parent, component, child)` row matching this
+document's own diagram id, the clicked component, and the node's own baked `data-drilldown-child`
+annotation all three at once does **not** return `false` — a component id reused by a different
+diagram, or a row whose declared child names a different diagram than the node's own annotation,
+shows the stale card (`showStale('missing-row')` or `showStale('missing-child')`) and still returns
+`true`. `true` means the request was handled; it may start loading a child
 or immediately show a stale card for an invalid bundle reference. It does not confirm that the
 iframe loaded or its handshake succeeded. The frame remains hidden until the expected diagram ID
 and spec digest pass the handshake. Neither `active()` nor `data-drilldown-state="open"` before
@@ -423,7 +424,4 @@ Depth above 8 levels. No shared children — the bundle is a tree, not a DAG: a
 `child` of at most one drilldown row, and a row may not target an ancestor of its own parent. No
 inline single-file bundles. No bare-path or cross-directory targets, and no `http(s)` targets. No
 automatic generation of children — a child is an authored diagram. No auto-layout. No network
-access and no model call anywhere in `bundle` or in the viewer runtime. No zoom-triggered descend —
-every descent still starts from the named Descend control, the drilldown mark, or a script calling
-`Archify.drilldown.descend()`; only the ascend side has a distance-aware shortcut
-(`ascendTo`/breadcrumb rungs), not the descend side.
+access and no model call anywhere in `bundle` or in the viewer runtime.
diff --git a/viewer/README.md b/viewer/README.md
index b47f206..224980d 100644
--- a/viewer/README.md
+++ b/viewer/README.md
@@ -21,8 +21,11 @@ Skill. These maintainer sources live outside the packaged `archify/` directory.
 From `archify/`, run `npm run generate:viewer` after editing any source.
 `npm run check:viewer` verifies freshness without writing; `npm test` includes
 that check. Assembly inserts each fragment verbatim at its fixed marker.
-Reader, Chrome Layout, Camera, Radar, Motion Governor, Finder, Intent Trace, Semantic Lens, Route Probe, Guided Views, Focus, Export and Dive
-extractions preserve delivered HTML bytes. Export cleanup adds a
+Reader, Chrome Layout, Camera, Radar, Motion Governor, Finder, Intent Trace, Semantic Lens, Route Probe, Guided Views, Focus and Export
+extractions preserve delivered HTML bytes — they were pulled out of
+`template.source.html` unchanged. `dive.js` is not one of those: it is a new
+fragment holding new functionality, not bytes moved out of somewhere else.
+Export cleanup adds a
 private function and a call, changing script bytes but preserving cleanup order
 and SVG output. All fragments retain classic-script scope and initialization order.
 Generated output is not a second editing
@@ -780,7 +783,7 @@ not resume panning — a drag can only begin on its own `pointerdown`, and the
 surviving finger's was already consumed when the pinch began.
 
 Every wheel tick and pinch update emits `{ phase, source, id }` through
-`on('gesture', cb)`/`off('gesture', cb)`, so a caller (Faz 3b's zoom-dive) can
+`on('gesture', cb)`/`off('gesture', cb)`, so a caller can
 tell a continuing physical gesture from a fresh one. `source` is `'wheel'` or
 `'pinch'` (`'buttons'`/`'keyboard'` are reserved, not yet emitted). Wheel ticks
 within 150ms of each other share one monotonically-assigned `id` and its
@@ -791,15 +794,20 @@ next tick starts a new one. Pinch phases are the gesture's own lifecycle:
 `lostpointercapture`, `'end'` otherwise). A wheel gesture that cannot change
 scale, and a pinch that cannot go below the 1x floor, both emit `minZoomOut`
 through `on`/`off` (not `onChange`/`offChange`) with `{ source, gestureId }`
-instead of changing the camera; Faz 3b's ascend trigger consumes that event.
+instead of changing the camera; a consumer such as an ascend trigger consumes that event.
 
 `onChange(cb)`/`offChange(cb)` subscribe to every `apply()`, receiving
 `{ scale, x, y, mode, detail, transitioning }` (`detail` is `detailLevel()`'s
-current value). Every `apply()` fires the callback twice: immediately with
-`transitioning: true` for the just-set target state, then again with
-`transitioning: false` once that state has visually settled — on the SVG's own
-`transitionend` for `transform`, or a 200ms fallback when no CSS transition runs
-(reduced motion, or a JS-eased transaction that sets `transition: none` itself).
+current value). Every `apply()` fires the callback immediately with
+`transitioning: true` for the just-set target state; a second call with
+`transitioning: false` follows once that state has visually settled — on the
+SVG's own `transitionend` for `transform`, or a 200ms fallback when no CSS
+transition runs (reduced motion, or a JS-eased transaction that sets
+`transition: none` itself) — unless a newer `apply()` supersedes this one
+first, in which case this `apply()`'s settled callback never fires at all
+(`clearTransitionSettle()`, called at the top of `notifyChange()` for the new
+`apply()`, cancels the still-pending watch outright rather than letting it
+run alongside the new one).
 Only the latest `apply()`'s settle watch is armed; a superseding `apply()` before
 settlement cancels the prior watch instead of stacking listeners. `on(event, cb)`/
 `off(event, cb)` are the generic form used for other camera events (`minZoomOut`,
@@ -1047,9 +1055,11 @@ behavior" is the reading-order companion to this section.
   walking the parent's own manifest from the child's id down, so a
   grandchild's hello, in turn, carries a smaller subtree rooted at itself.
   `readManifest()` prefers an embedded script (only ever true at the entry)
-  and otherwise returns this received subtree. A leaf child's subtree has an
-  empty `diagrams`/`drilldowns` pair and therefore never offers a further
-  descend. A hello's `subtree`, when present, is shape-validated
+  and otherwise returns this received subtree. A leaf child's subtree is not
+  empty: `diagrams` still carries the leaf's own manifest row (`byId[id]` for
+  its own id), only `drilldowns` is empty, and that empty `drilldowns` is
+  what keeps it from ever offering a further descend. A hello's `subtree`,
+  when present, is shape-validated
   (`validateSubtreeShape`) before it is accepted at all: every `diagrams[]`
   entry's `id`/`file`/`spec_sha256` and every `drilldowns[]` row's
   `parent`/`component`/`child` must have the expected format, and
@@ -1080,8 +1090,11 @@ behavior" is the reading-order companion to this section.
   `requestId` (a second, ascend-specific monotonic counter): a document only
   acts on an `ascend-done` whose `requestId` matches the one it most recently
   sent, and `back()`/a new `handleAscendRequest` call both cancel the
-  previous request's pending 200ms timer outright (`cancelPendingAscend()`,
-  storing the real timer id) rather than only clearing a callback reference —
+  previous request's pending settle timer outright — its timeout is not a
+  fixed 200ms but `ASCEND_SETTLE_STEP_MS` (250ms) times
+  `max(1, max_depth - myDepth)`, so a deeper ascend gets a longer window —
+  (`cancelPendingAscend()`, storing the real timer id) rather than only
+  clearing a callback reference —
   a superseded request's timer literally cannot fire once cancelled, and even
   if it somehow did, the session/requestId/`current` checks below would still
   reject its effect.
@@ -1226,9 +1239,14 @@ directly and reads `Archify.view` only through the Camera contract's public
 is untouched by this module. A diagram with no `[data-drilldown-child]` node
 anywhere in its own SVG (neither an entry's own manifest row nor a nested
 child's received subtree row) is not "capable": the toggle button stays
-`hidden`, `Z` is a no-op, and no listener is registered. Embed pages are
-never capable either, the same as Focus/Lens/Route reject embed at their own
-entry points.
+`hidden` and `Z` is a no-op. That alone does not mean no listener is
+registered: a nested child with no drilldown of its own (a leaf) is still
+"escape-capable" (`!embed && nestedChild`) and keeps its `minZoomOut` and
+`gesture` listeners for the zoom-out escape below — a leaf must not lose
+its ability to escape merely because it has nothing left to dive into. Only
+a diagram that is neither capable nor a nested child registers no listener
+at all. Embed pages are never capable or escape-capable either, the same as
+Focus/Lens/Route reject embed at their own entry points.
 
 - **Belirginleştirme is always on, independent of the toggle.** The camera's
   own `detailLevel()` `full` threshold (scale ≥ 1.75, or semantic mode) is
@@ -1251,9 +1269,13 @@ entry points.
   no `prefers-reduced-motion`, not the mobile-contained wide-diagram mode
   (`window.innerWidth <= 720 && container.hasAttribute('data-wide-diagram')`,
   the same predicate `viewer-camera.js` itself uses), none of Route Probe /
-  Semantic Lens / Intent Trace / Presentation active, no redive lock, and
-  `Archify.drilldown.active()` false (covers a handshake in flight as well as
-  an already-open child). The candidate node is whichever
+  Semantic Lens / Presentation active (deliberately excluding Intent Trace,
+  whose own "active" node is just its ordinary 90ms fine-pointer hover
+  preview — almost always true while a real mouse hovers the very node
+  being wheel-zoomed, so treating it as blocking would make the feature
+  nearly unreachable from a real mouse), no redive lock, `rearmed` (below),
+  and `Archify.drilldown.active()` false (covers a handshake in flight as
+  well as an already-open child). The candidate node is whichever
   `[data-drilldown-child]` element's own `getBBox()` contains the center of
   `Archify.view.logicalViewport()`, in the SVG's own user-space coordinates
   (these node groups carry no per-node transform, so `getBBox()` is already
@@ -1283,16 +1305,25 @@ entry points.
   This entire path is skipped outside a nested child
   (`html[data-bundle-nested]`) and when the toggle is off; at the root,
   `escapeToParent()` itself is a no-op, so nothing happens either way.
-- **Redive lock.** A `MutationObserver` on `html`'s own `data-drilldown-open`
-  attribute sets a local lock the instant that attribute is removed (this
-  document's own child just closed, whether by `back()` or by an `ascendTo`
-  closing it from above) — the same signal `Archify.drilldown` itself uses
-  for local open/closed state. The lock is cleared by a fresh `pointerdown`
-  or `keydown` anywhere in the document, or by an `on('gesture', cb)`
-  `'start'` phase whose `source + ':' + id` differs from the pair that drove
-  the escape (a wheel tick that is part of the very same gesture that caused
-  the ascend does not clear it; a new gesture, or pinch, does). While locked,
-  a still-eligible camera position never restarts a dwell.
+- **Redive lock and `rearmed`.** A `MutationObserver` on `html`'s own
+  `data-drilldown-open` attribute sets a local lock and clears `rearmed` to
+  `false` the instant that attribute is removed (this document's own child
+  just closed, whether by `back()` or by an `ascendTo` closing it from
+  above) — the same signal `Archify.drilldown` itself uses for local
+  open/closed state. The two conditions clear independently and a new dwell
+  needs both: the lock itself clears on either (i) a fresh `pointerdown` or
+  `keydown` anywhere in the document, or (ii) an `on('gesture', cb)`
+  `'start'` phase once the document has gone ≥400ms (`GESTURE_SILENCE_MS`)
+  without any gesture activity at all — deliberately time-based and
+  document-local rather than comparing `source`/`id` pairs, since the
+  gesture that caused the ascend happened in a different document (the
+  child) with its own independent id space, so only elapsed silence can
+  tell a continuing wheel flow from a fresh one. `rearmed` flips back to
+  `true` only once the camera is later seen at `scale < 2.5` on a settled
+  snapshot — the reader has zoomed back out past the dive threshold at
+  least once since the ascend. While either the lock still holds or
+  `rearmed` is still `false`, a still-eligible camera position never
+  restarts a dwell.
 - **Nothing here changes export, print or SVG bytes.** `data-dive`,
   `data-dive-preview` and `#archify-dive-status` are `html`/HTML-layer state
   or (transiently) one live-SVG attribute already covered by export cleanup;
```

### Anything left open
- Same GIF non-determinism as round 1: `docs/assets/archify-live-proof.gif` differs from `a850ecc`
  byte-for-byte (expected, not rebuilt from scratch — carried through from the round-1 rebuild at
  commit 7', which itself differs from the snapshot for the same reason documented in Tur 1).
- Round-1 branch `feat/nested-drilldown-split` (head `1697c8c`) left in place, untouched, for
  comparison as instructed. `backup/wip-snapshot-2026-09-13` (`a850ecc`) untouched. New branch
  `feat/nested-drilldown-split2` left in place for Fable's review/fast-forward. No push, no GitHub
  interaction, `docs/plans/` not committed on either split branch, main working tree at
  `/home/ubuntu/repos/archify` untouched except this report file.
