**E. DÜZELTMEYLE KABUL.** The PR boundary and template regeneration are sound; documentation placement and accuracy need corrections. References below use each named commit’s line numbers.

**A. PR1 has no newly introduced camera/dive feature bytes.**
Ran `git diff cc1b33a eb888b2 | rg -ni 'wheel|pinch|zoomAt|minZoomOut|onChange|dive|dwell|z.toggle'`.
The sole match is unchanged context: `eb888b2:CHANGELOG.md:14`, where `navigationChanged` contains `onChange`. Filtering to added/deleted lines produces **zero matches**, including generated HTML.
Literal keywords already exist in the base: for example, the media-query callback at `cc1b33a:viewer/template.source.html:5863` becomes `eb888b2:viewer/template.source.html:5894`. These are not PR2 leakage.

**B. Hunk boundaries: mostly correct.**

- **2 — `2a838a4`:** Recursive runtime, supporting CSS, tests, reader documentation and changelog belong together. No camera/dive hunks. Evidence: `viewer/template.source.html:6497`, `viewer/README.md:944`, `archify/references/drilldown-bundles.md:244`, `CHANGELOG.md:13`.
- **3 — `f033fb4`:** Exactly four nested-padding/margin CSS rules plus generated copy; no behavior code. `viewer/template.source.html:4487`.
- **5 — `48520f2`:** Camera implementation and touch-action CSS are correctly placed (`viewer/viewer-camera.js:312`, `viewer/template.source.html:862`). **Misplaced phrases:** `viewer/README.md:782,793` describe “Faz 3b’s zoom-dive” and its ascend consumer. Move those consumer references to commit 6; retain the camera event contract.
- **6 — `7bf8fa9`:** Dive wiring, cleanup, i18n, fixtures, tests and shortcuts match the plan, including the NaN/Infinity guard (`archify/test/generate-viewer.test.mjs:144`). **Contradictory hunk:** `archify/references/drilldown-bundles.md:426` adds “No zoom-triggered descend,” contradicting its new opt-in section at line 338. Delete that prohibition.

The documentation is correctly grouped otherwise, but these newly added claims also need correction:

- `2a838a4:viewer/README.md:982,1014`: leaf subtrees retain the leaf diagram, and the ascend timeout is depth-scaled, not 200ms (`viewer/template.source.html:6525,6294`). Correct the “empty subtree” claim in `CHANGELOG.md:13` too.
- `2a838a4:archify/references/drilldown-bundles.md:258`: a missing row produces stale state and returns **true**, not false (`viewer/template.source.html:6838,6853`).
- `48520f2:viewer/README.md:797`: superseded `apply()` calls need not receive a settled callback (`viewer/viewer-camera.js:165`).
- `7bf8fa9:viewer/README.md:1229,1254,1292`: nested leaves retain escape listeners; Intent Trace does not block dive; re-entry requires the silence/input condition **and** re-arming below 2.5 (`viewer/dive.js:39,121,219,274,285`). Align `CHANGELOG.md:16` and the dive reference accordingly.
- `7bf8fa9:viewer/README.md:24`: Dive is a new feature, not an extraction preserving delivered HTML bytes.

**C. All four regenerated templates pass.**
Actually checked out each SHA and ran `npm run check:viewer --prefix archify`, using Node **22.23.2**; every command exited **0**. `npm ci` was unnecessary.

| Commit | Regenerated `archify/assets/template.html` evidence | Check |
|---|---|---|
| `2a838a4` | `:15228` — subtree builder | PASS |
| `f033fb4` | `:4487` — nested padding | PASS |
| `48520f2` | `:11948` — `zoomAt` | PASS |
| `7bf8fa9` | `:16208` — `Archify.dive` | PASS |

**D. Subjects are accurate; revise three message bodies.**

- **2:** Replace “every cross-frame message” with “every navigation reply/request”; Locate projection has no session (`2a838a4:viewer/template.source.html:6820`).
- **5:** Replace the unverifiable “reverted/Faz 3a/abandoned rewrite” history with the actual test description: “Browser checks wait for transform stability and a 260ms minimum” (`48520f2:archify/test/viewer-wheel-browser.test.mjs:50`).
- **6:** Specify “scale ≥2.5,” movement beyond epsilon, the named blocking modes, and re-arming below 2.5 (`7bf8fa9:viewer/dive.js:15,121,179,189,219`). “Next gesture” alone is insufficient.

**Required fixes:** move the two premature dive references, remove the contradictory prohibition, correct the contract text and three message bodies above, and refresh affected packaged documentation afterward. No implementation relocation is needed.

Original branch restored; working tree clean. No files modified.