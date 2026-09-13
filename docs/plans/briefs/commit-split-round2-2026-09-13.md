# Commit split — round 2 (astra corrections) — 2026-09-13

Executor: Claude Sonnet 5. Reviewer: Fable. Input: round-1 result on branch `feat/nested-drilldown-split`
(worktree `/tmp/claude-1000/-home-ubuntu-repos-AIWorkspace/44f257c0-9f19-4bde-8a89-1d84b1b2297d/scratchpad/archify-split`,
commits `15e9313 2a838a4 f033fb4 eb888b2 48520f2 7bf8fa9 1697c8c` on `cc1b33a`) and astra's review
`docs/plans/reviews/commit-split-astra-1-2026-09-13.md` (verdict: DÜZELTMEYLE KABUL — all findings
verified by Fable against the code; apply ALL of them). Same hard rules as round 1 (no push, never touch
the main tree at `/home/ubuntu/repos/archify` except the report, never delete `backup/wip-snapshot-2026-09-13`,
Co-Authored-By trailer on every commit). Only DOCUMENTATION text and COMMIT MESSAGES change in this round —
no source, test or CSS edits at all. Rebuild the history on a NEW branch `feat/nested-drilldown-split2`
from `15e9313` (commit 1 is unchanged) by cherry-picking each old commit and amending it as listed.
Keep the old branch untouched for comparison.

## Commit 2' (from 2a838a4) — doc accuracy + message
- `viewer/README.md` "Drilldown contract": (a) the leaf-subtree sentence (~line 982) — the subtree a leaf
  receives is NOT empty: `diagrams` contains the leaf's own manifest row and `drilldowns` is empty, which
  is why no further descend is offered (code: template.source.html subtree builder pushes `byId[id]` for the
  leaf itself). (b) the ascend timer sentence (~line 1014): the fallback is not a fixed 200ms; it is
  `ASCEND_SETTLE_STEP_MS (250) * max(1, max_depth - myDepth)` per level. Fix both.
- `archify/references/drilldown-bundles.md` (~line 258): `descend()` returns `false` only for "already has
  its own child open" / depth ceiling; a MISSING manifest row or missing child shows the stale card and
  returns `true` (code: `showStale('missing-child'|'missing-row'); return true;`). Fix the sentence.
- `CHANGELOG.md` "Recursive Viewer descend" bullet: replace "a leaf's subtree is empty and never offers a
  further descend" with the accurate statement (leaf row only, no drilldown rows).
- Message body: replace "every cross-frame message carries a session number" with "every navigation
  request/reply (hello ack, escape, breadcrumb, ascend) carries a session number" — the Locate projection
  message has none.
## Commit 3' — cherry-pick f033fb4 unchanged.
## Commit 4' (from eb888b2) — cherry-pick, then rebuild ONLY `archify.zip` (`scripts/build-zip.sh`) because
`archify/references/drilldown-bundles.md` is packaged in it; amend. Keep every other generated file as
cherry-picked (the GIF is non-deterministic — do not rebuild it). Gate: the PR1 leak grep from round 1 → empty;
`node --test test/release-package-gates.test.mjs test/readme-showcase.test.mjs` (from `archify/`) pass.
## Commit 5' (from 48520f2) — doc accuracy + message
- `viewer/README.md` camera section (~lines 782 and 793): remove the two "Faz 3b's zoom-dive" / "Faz 3b's
  ascend trigger" consumer references — say "a caller" / "a consumer such as an ascend trigger" without
  naming dive (dive does not exist yet at this commit). (~line 797) "Every apply() fires the callback
  twice" → correct: the settled (`transitioning:false`) callback is skipped for an `apply()` that is
  superseded by a newer one before it settles (`clearTransitionSettle()` in `notifyChange`).
- Message body: delete the sentence about "reverted (Faz 3a tur-3) version — the abandoned settle()
  determinism rewrite"; describe the test instead: "viewer-wheel-browser.test.mjs covers wheel/pinch/
  minZoomOut in a real Chrome; its checks wait for transform stability with a 260ms minimum".
## Commit 6' (from 7bf8fa9) — doc accuracy + message
- `viewer/README.md`: (~line 24) the fragment-list intro claims extraction preserving delivered bytes —
  add that `dive.js` is a new fragment, not an extraction. (~line 1229) "no listener is registered" is
  wrong for a nested LEAF: it keeps the `minZoomOut` subscription for escape (`escapeCapable`) even though
  it is not `capable`; fix. (~line 1254) remove "Intent Trace" from the blocking list — dive.js
  deliberately excludes it (comment at `blockingActive()`); the blockers are Route Probe, Semantic Lens,
  Presentation (check the code for the exact list and state it). (~line 1292) the redive lock clears
  only when BOTH hold: (a) a fresh pointerdown/keydown, or a gesture `'start'` with a different
  `source:id` after ≥400ms (`GESTURE_SILENCE_MS`) of gesture silence, AND (b) the camera has been seen
  below scale 2.5 since the ascend (`rearmed`). State that precisely.
- `archify/references/drilldown-bundles.md` (~line 426): delete the now-false "No zoom-triggered
  descend — every descent still starts from …" prohibition (keep the rest of that limits paragraph
  intact); it contradicts the new "Zoom-dive (opt-in)" section at ~338.
- `CHANGELOG.md` dive bullet: fix the same two facts (blocking list without Intent Trace; lock release =
  silence/input condition AND re-arm below 2.5, not "next gesture").
- Message body: state the precise trigger (manual mode, scale ≥ 2.5, dwell cancelled by camera movement
  beyond the epsilons or lost eligibility), the exact blocking surfaces, and the lock-release rule above.
## Commit 7' (from 1697c8c) — cherry-pick, rebuild ONLY `archify.zip`, amend. Gates: from `archify/`
`npm run check:viewer`, `node --test test/release-package-gates.test.mjs test/readme-showcase.test.mjs
test/generate-viewer.test.mjs`; `git diff a850ecc HEAD --stat -- . ':!docs/plans'` must list ONLY:
`viewer/README.md`, `archify/references/drilldown-bundles.md`, `CHANGELOG.md`, `archify.zip`,
`docs/assets/archify-live-proof.gif`, `docs/assets/archify-live-proof.json`. Print the full text diff of
the three doc files vs a850ecc in the report so Fable can review every changed sentence.
## Report
Append a "## Tur 2 (astra düzeltmeleri)" section to
`/home/ubuntu/repos/archify/docs/plans/reports/commit-split-2026-09-13.md`: new SHAs for all 7 commits
(PR1_HEAD'/PR2_HEAD'), gate outputs, the doc diffs. Do not remove any worktree/branch.
