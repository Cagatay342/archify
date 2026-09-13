# Commit split brief — `feat/nested-drilldown` → 7 reviewable commits (2026-09-13)

Executor: Claude Sonnet 5 subagent. Reviewer: Claude Fable 5.1. Map: `docs/plans/upstream/commit-plan.md`
(astra-approved). Where this brief and commit-plan.md differ, THIS BRIEF WINS (it corrects four
file assignments the plan got wrong — see "Corrections" below).

## Setup (do exactly this)

- Fork: `/home/ubuntu/repos/archify`. Base: `cc1b33a` (`feature/identity-map`, PR #367). Branch
  `feat/nested-drilldown` is currently AT `cc1b33a` with 67 uncommitted entries = the final state.
- **Snapshot of the final state is committed on branch `backup/wip-snapshot-2026-09-13` = `a850ecc`.**
  Every file you need comes from there (`git show a850ecc:<path>` / `git checkout a850ecc -- <path>`).
  Never delete or move that branch. Never touch the main working tree at `/home/ubuntu/repos/archify`
  (its uncommitted files are the user's safety copy); do NOT run `git stash`, `git reset`, `git checkout`
  there.
- Work in a NEW worktree: 
  `git -C /home/ubuntu/repos/archify worktree add /tmp/claude-1000/-home-ubuntu-repos-AIWorkspace/44f257c0-9f19-4bde-8a89-1d84b1b2297d/scratchpad/archify-split -b feat/nested-drilldown-split cc1b33a`
  then `npm ci` there. Node 22 (`node --version` → v22.x). Browser tests need `ARCHIFY_CHROME=/usr/bin/google-chrome`.
  `ffmpeg` is at `/usr/bin/ffmpeg`.
- Git identity is already configured. Every commit message ends with a blank line and then
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No push. No GitHub. No AIWorkspace repo edits. Do not commit `docs/plans/` (Fable commits it separately).

## Method for hunk-split files

For a file that belongs to several commits, the content at each commit is the final file
(`a850ecc:<path>`) with the LATER commits' hunks removed. Build each intermediate version by copying
the final file and deleting/reverting the later hunks by hand (or `git diff cc1b33a a850ecc -- <path>`
→ split hunks into patch files → `git apply --cached` only the hunks that belong). The invariant that
proves you got it right: **after commit 7, `git diff a850ecc feat/nested-drilldown-split -- . ':!docs/plans'`
must be EMPTY** — nothing lost, nothing invented. Check it; put the command's output in the report.

Generated files (`archify/assets/template.html`, `archify/renderers/shared/generated-validators.mjs`)
are NEVER hand-edited or copied from the snapshot for intermediate commits — regenerate them from the
sources at that commit (`npm run generate:viewer`, `npm run generate:validators`) and commit the output
in the same commit as the source change. Only the FINAL commit's regenerated files must equal the snapshot.

## Commits (in this order, on `feat/nested-drilldown-split` from `cc1b33a`)

### 1. `feat(bundle): recursive (N-depth) bundle manifests and tree validation`
Whole files from snapshot: `archify/schemas/bundle.schema.json`, `archify/bundle/diagram-bundle.mjs`,
`archify/schemas/README.md`, `archify/locate/cli.mjs`, `archify/test/bundle-schema.test.mjs`,
`bundle-validate.test.mjs`, `bundle-ownership.test.mjs`, `bundle-message-origin-browser.test.mjs`,
`helpers/bundle-fixture.mjs`, `archify/test/generate-validators.test.mjs` (correction: plan omitted it;
its only change is `max_depth: 2` in the fixture), new `archify/test/bundle-depth.test.mjs`,
`locate-bundle-depth.test.mjs`, `archify/test/fixtures/bundle-checkout-deep/`,
`fixtures/bundle-checkout/manifest.reference.json`. Regenerate `generated-validators.mjs`
(`npm run generate:validators`) — it must equal the snapshot's copy (check with `git diff a850ecc --`).
Hunk-split: `CHANGELOG.md` → only the "**N-depth drilldown bundles.**" bullet.
`archify/references/drilldown-bundles.md` → only hunks about bundle rules/manifest/validation/
`max_depth`/ownership chain (NOT "Reader behavior" prose about the Viewer's recursive descend, NOT
anything mentioning wheel/pinch/`Z`/dive/dwell). Read the diff and decide per hunk; list the split
in the report.
Gate: `npm run check:validators` and `node --test archify/test/bundle-*.test.mjs archify/test/locate-bundle-depth.test.mjs archify/test/generate-validators.test.mjs` pass.

### 2. `feat(viewer): recursive descend, breadcrumb and Escape ladder`
- `viewer/template.source.html` hunk-split: everything in the `Archify.drilldown` IIFE (subtree
  manifest in hello, `myDepth`/`level`, session + `requestId` on every message, two receivers,
  `publishChain`/`chainBelow`/breadcrumb, `closeInnermost`/`ascendTo`/`handleAscendRequest`,
  `ASCEND_SETTLE_STEP_MS`, `drillFor`, Escape/Backspace ladder in the keydown handler, the
  `data-drilldown-state`/`data-drilldown-anim` CSS selector changes), plus the shared-keydown change
  that calls `closeInnermost`. EXCLUDE: the four `html[data-bundle-nested="true"]` padding/margin CSS
  rules (→3); `touch-action` CSS lines (→5); `.archify-dive-status`/dive-preview/ring CSS, the
  "Belirginleştirme: always on…" highlight CSS block, the `<p class="archify-dive-status">` markup,
  the `archify:dive-pref` handling, the `dive`/`divePref` exports, the `Z` keydown branch, the `Z ->`
  help line and the `/* ARCHIFY:DIVE */` marker (→6). Where one hunk mixes both (e.g. the big
  message-handler hunk, the exports hunk), split it line-by-line.
- `archify/bin/visual-check.mjs` (whole; only `extraArgs`), `archify/test/drilldown-browser.test.mjs`,
  `drilldown-keyboard.test.mjs`, new `drilldown-nested-browser.test.mjs`.
- `viewer/README.md` hunk-split: only the "## Drilldown contract" section (and any line in the fragment
  list/intro that is about drilldown, not dive/camera).
- `archify/references/drilldown-bundles.md`: the "Reader behavior" hunks about recursive descend,
  breadcrumb, Esc ladder (not dive/wheel).
- `CHANGELOG.md`: only the "**Recursive Viewer descend.**" bullet.
- `npm run generate:viewer` → commit `archify/assets/template.html` with it.
Gate: `npm run check:viewer`; `ARCHIFY_CHROME=/usr/bin/google-chrome node --test archify/test/drilldown-*.test.mjs` pass.

### 3. `chore(viewer): compress nested-child chrome padding (CSS only)`
Only the four `html[data-bundle-nested="true"]` CSS rules in `template.source.html` + regenerated
`template.html`. Gate: `git show --stat HEAD` touches exactly those two files; `npm run check:viewer`.

### 4. `chore: rebuild generated artifacts for PR1 (recursive bundles + descend + nested CSS)`
Rebuild from THIS tree (not the snapshot): `npm run render:examples` (default output root AND
`../examples` — see `package.json`; the plan says both roots), `archify compare architecture` for
`examples/checkout-platform-delta.{html,receipt.json}` (use the exact command from
`archify/test/architecture-delta.test.mjs`), `npm run build:gallery`, `npm run build:readme-showcase`,
`scripts/build-zip.sh`. Commit only the generated outputs listed in commit-plan.md §4. Do NOT touch
`docs/cases/archify-self`, `docs/cases/mco-runtime.*`, `experiments/mco-showcase`.
**PR1-head gates (all must pass; put outputs in the report):**
- `git diff cc1b33a HEAD -- viewer archify/assets/template.html archify/test archify/references viewer/README.md CHANGELOG.md | grep '^+' | grep -n -i -E 'dive|zoomAt|minZoomOut|pinch|onChange|offChange|tickWheelGesture|dwell' ` → must print NOTHING (no PR2 bytes in PR1).
- `ARCHIFY_CHROME=/usr/bin/google-chrome npm test` → full pass. Known exception: `route-journey`/`route-probe`
  browser tests may fail only under load — rerun those files alone; if alone they pass, record both results.
  Anything else failing = stop and report (do not "fix" product code here; if a split mistake caused it,
  fix the split).
- Tag nothing; just record `git rev-parse HEAD` as PR1_HEAD in the report.

### 5. `feat(viewer): cursor/pinch-anchored camera gestures and onChange`
`viewer/viewer-camera.js` whole; `template.source.html` hunk: only the two `touch-action` CSS lines
(verify they are camera-related; if either belongs to dive, move it to 6); regenerated `template.html`;
new `archify/test/viewer-wheel-browser.test.mjs` (as-is from snapshot — it is the reverted Faz 3a
version); `archify/references/viewer-runtime.md` → only the wheel/pinch line; `viewer/README.md` → only
the camera/`onChange`/`zoomAt`/`gesture` documentation hunks; `CHANGELOG.md` → only the
"**Wheel and pinch camera zoom.**" bullet.
Gate: `npm run check:viewer`; `ARCHIFY_CHROME=... node --test archify/test/viewer-wheel-browser.test.mjs` (26 tests; it may be load-sensitive — run alone).

### 6. `feat(viewer): opt-in zoom-to-descend (dive)`
Everything remaining: `viewer/dive.js` (new), the rest of `template.source.html`, `scripts/generate-viewer.mjs`
(one line), regenerated `template.html`, `viewer/export-cleanup.js`, remaining `viewer/README.md` hunks
("## Drilldown dive contract", `dive.js` in fragment list), `archify/renderers/shared/i18n.mjs`,
`archify/test/generate-viewer.test.mjs` (ALL of its diff — correction: the NaN/Infinity guard test is
new in this work, it does not predate it), new `archify/test/drilldown-dive-browser.test.mjs`,
`archify/test/fixtures/bundle-dive/`, remaining `viewer-runtime.md` line, remaining
`drilldown-bundles.md` hunks (dive), `CHANGELOG.md` last bullet, `README.md`/`README_EN.md`/`README_ZH.md`
(option (b) of the plan: the one-row change lands whole here).
Gate: `npm run check:viewer`; `ARCHIFY_CHROME=... node --test archify/test/drilldown-dive-browser.test.mjs archify/test/generate-viewer.test.mjs`.
After this commit, all SOURCE files must equal the snapshot:
`git diff a850ecc HEAD --stat -- . ':!docs/plans' ':!archify.zip' ':!examples' ':!archify/examples' ':!docs/gallery' ':!docs/gallery.html' ':!docs/assets'` → empty.

### 7. `chore: rebuild generated artifacts for PR2 (camera + dive)`
Same rebuild commands as 4. **PR2-head gates:** `git diff a850ecc HEAD -- . ':!docs/plans'` → EMPTY
(the final tree equals the snapshot byte-for-byte, generated artifacts included; if a generated file
differs, find out why — e.g. a non-deterministic build — and report, do not paper over by copying).
`ARCHIFY_CHROME=... npm test` full pass with the same route-flake exception rule. Record HEAD as PR2_HEAD.

## Corrections to commit-plan.md (already applied above)
1. `archify/test/generate-validators.test.mjs` was missing → commit 1.
2. `archify/references/viewer-runtime.md` was missing → split 5/6.
3. `archify/references/drilldown-bundles.md` is NOT whole-file commit 1 → split 1/2/6.
4. The NaN/Infinity guard test in `generate-viewer.test.mjs` is new → commit 6, whole diff.

## Report
Write `docs/plans/reports/commit-split-2026-09-13.md` in the MAIN fork dir (`/home/ubuntu/repos/archify/docs/plans/reports/`,
not the worktree): per commit → `git show --stat` summary, the per-hunk split decisions for the
shared files, every gate command with its actual result (numbers, not adjectives), PR1_HEAD/PR2_HEAD
SHAs, the two "empty diff" proofs, anything left open. Do not remove the worktree or the split branch;
Fable does the fast-forward and cleanup after review. If something does not resolve in 2 attempts,
stop, write what you have, and report.
