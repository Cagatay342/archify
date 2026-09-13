# Draft PR 2 — camera gestures and an opt-in "zoom to descend" (dive)

Status: **draft, not opened**. Depends on PR 1 (recursive bundles + recursive Viewer descend);
posting requires maintainer/user approval, and should follow PR 1's own review rather than land
first.

Base: PR 1's head (or `feature/identity-map` directly, if PR 1 is rebased/merged first).
Head: fork `Cagatay342/archify` branch `feat/nested-drilldown`, phases 3a–3b.

## Motivation

The Viewer's camera (`viewer/viewer-camera.js`) currently changes scale only through the `+`/`-`
buttons, `0` to reset, and keyboard — there is no wheel or pinch gesture, and no change-notification
API for other code to react to camera movement. Recursive descend (PR 1) makes "zoom into a
component and it opens" a natural next interaction, but that needs two things PR 1 intentionally
does not include: a continuous zoom gesture to zoom *with*, and an explicit, reversible policy for
when zooming that far should trigger a descend at all. This PR splits those into two phases so
each can be reviewed against its own contract.

## Phase A — camera gestures (cursor/pinch-anchored zoom, `onChange`)

**Scope**

- Mouse wheel zoom, cursor-anchored (`p' = q - (q - p) * s'/s`, position clamp aside): the point
  under the cursor stays fixed as scale changes. `ctrlKey` (trackpad pinch gesture) uses the
  existing stronger 0.01 coefficient vs. plain wheel's 0.0015; `deltaMode` 1/2 (line/page) scale
  `deltaY` by 16x/100x first, matching the browser's own delta semantics.
- Two-finger touch pinch, midpoint-anchored, with pointer capture held for the gesture's whole
  lifetime (not just its start) and third-finger and one-finger-lifted edge cases explicitly
  handled — losing pointer capture during a pinch must not leave drag/pan armed afterward, and
  lifting one finger of a two-finger pinch must end that gesture rather than silently resuming a
  pan with the remaining finger.
- At the existing scale-1 floor, wheel-down/pinch-out don't just clamp — they emit a
  `minZoomOut` event (`{source, gestureId}`) instead of doing nothing, so a caller (phase B) can
  treat "the user is trying to zoom out past the minimum" as a distinct signal from "nothing
  happened." A `minZoomOut` payload identifies the gesture that produced it so a consumer can
  tell a continuing physical gesture from a genuinely new one, rather than inferring that from
  timing alone.
- `Archify.view.onChange(cb)` / `offChange(cb)`: every camera change (wheel, pinch, `+`/`-`, `0`,
  programmatic) notifies subscribers with `{scale, x, y, mode, transitioning}` — `transitioning`
  is `true` the instant a change starts and flips to `false` only once the CSS transition has
  actually finished (a real `transitionend` on the transform, with a bounded fallback in case that
  event is ever missed) — snapshot, not a polling API.
- The existing `1–3` scale clamp, quarter-step snapping for the buttons, and `detailLevel()`
  thresholds (`map` / `read` / `full`) are unchanged; wheel/pinch stay inside the same bounds.
- Reduced motion: the existing `transition: none !important` under
  `prefers-reduced-motion: reduce` already applies to whatever sets `transform`, so manual
  wheel/pinch zoom is unaffected in kind — it simply renders without an animated transition, same
  as the existing buttons already do.
- Export is unaffected by construction: wheel/pinch only ever change `svg.style.transform` and
  `.diagram-container`'s own layout; `export-cleanup.js`'s strip list already removes transform
  before serializing, and a container-level CSS class added for the gesture state never enters
  the export filter's allowed-selector set. Verified directly: exporting before and after a
  wheel-then-pinch sequence produces byte-identical SVG.

**Compatibility — additive to the API, but not behavior-invisible; listed explicitly rather than
claimed as a blanket "no behavior change" (this description's own earlier draft overstated that):**

- No existing camera API changes signature; `zoomAt()`/`zoom()` are unchanged. Behavior when *not*
  interacted with (initial render, `+`/`-`/`0`, keyboard, no mouse/touch near the diagram) is
  identical.
- **New wheel/pinch listeners are added unconditionally to every diagram** (this is not opt-in;
  only Phase B's dive is). `.diagram-container` gets a `{passive:false}` `wheel` listener and
  pointer/touch pinch handling it did not have before. At scale 1, wheel-down still falls through
  to the page's own scroll (net visual result matches today), but the event is now intercepted by
  application code first rather than never reaching a listener at all — worth flagging for anyone
  who has their own wheel handling layered on top of a diagram.
- **The existing always-on drilldown-mark highlight becomes far more reachable.** #367 already
  highlights drilldown-capable nodes once the camera's own `detailLevel()` reaches `full`
  (`>= 1.75` scale, CSS keyed off `.diagram-container[data-detail-level="full"]`,
  `viewer/template.source.html:4404`) — this PR does not add that CSS or its trigger condition.
  But today reaching `full` requires repeated `+` clicks or keyboard; after this PR, a single
  wheel-scroll or pinch gets there, so far more readers will incidentally see this highlight than
  before, purely as a side effect of the gesture being easier to trigger by accident.
- `1–3` scale clamp, quarter-step snapping for the `+`/`-` buttons, and the `detailLevel()`
  thresholds themselves (`map`/`read`/`full`) are unchanged.

## Phase B — opt-in zoom-to-descend ("dive")

**Scope**

- A Viewer toggle (keyboard `Z`, a corresponding button when the diagram has any
  `drilldown`-carrying node) turns "dive" on or off; **default off**, per-`localStorage`, and
  announced down into an already-open child over the same validated hello/session channel PR 1's
  handshake uses (`archify:dive-pref {enabled, session}`) rather than relying on shared
  `localStorage`, since a `file://`-opened child does not share the parent's storage origin.
  A `dive-pref` message with a session that doesn't match the live descent (forged or stale) is
  rejected, the same as every other message on that channel.
- While on: zooming a centered, drilldown-carrying node past scale 2.5 and holding it there for
  250ms without the camera moving (any further change cancels the dwell) descends into it, gated
  through the exact same `Archify.drilldown.descend()` PR 1 uses for a click or the Passport
  action — dive is a third *trigger*, not a parallel code path.
- Ascending back out reuses phase A's `minZoomOut` signal: at the scale floor, two distinct
  zoom-out gestures (by `(source, gestureId)`, not just "two events") within a short window call
  `escapeToParent()`. A single continuing gesture, or a stray event at the floor from an unrelated
  cause, does not count as two.
- A **redive lock** prevents an accidental double-descend immediately after ascending: the lock
  only lifts once both (a) the camera has been seen below scale 2.5 again (an explicit re-arm,
  not just time passing) and (b) at least 400ms of real gesture silence has elapsed since any
  gesture activity on that document (or a fresh pointerdown/keydown fires immediately). Either
  condition alone is insufficient by design — verified with two tests that isolate each guard
  independently, not just their combination.
- Explicitly excluded from triggering a dive, all pre-existing states: `prefers-reduced-motion`,
  the mobile contained/scroll layout, Route Probe / Semantic Lens / Intent Trace active, and while
  a child handshake is already pending.
- A live region (`role="status" aria-live="polite"`) announces the dwell-in-progress state in the
  DOM; this repo's test suite verifies the DOM text change itself (there is no assistive-technology
  test harness here), not that a screen reader actually announces it.
- `Z` is guarded against the browser's own key-repeat (holding the key must not re-toggle
  repeatedly) and against activating while focus is inside a `SELECT` or a `role="textbox"`
  element.
- On a plain (non-bundle) diagram, or one whose entry has no drilldown-carrying node at all, the
  toggle is hidden and `Z` is a documented no-op — zero listeners are registered in that case, not
  merely "the feature does nothing."

**Compatibility**: fully opt-in and off by default. A diagram author or reader who never presses
`Z` sees no behavior change whatsoever versus PR 1 alone; click, Passport "Descend", the drilldown
mark, and keyboard Escape/Backspace navigation are all unchanged. Export, print, SVG bytes, and
the schema/IR are unaffected — this phase is Viewer-only.

## Tests

- Camera gestures: wheel and pinch anchor-fixed zoom (including under RTL negative `scrollLeft`
  and after a resize), `deltaMode`/`ctrlKey` coefficient checks, pointer-capture loss and
  third-finger/one-finger-lifted edge cases, `minZoomOut` gesture-identity de-duplication,
  `onChange` transitioning semantics, and the export byte-identity check above.
- Dive: toggle default-off and its no-op guards (repeat key, `SELECT`/textbox focus, plain
  diagram); a full zoom-dwell-descend cycle gated on the real ACK handshake, exactly like a
  manual descend; two independent tests that isolate each redive-lock guard (silence-without-rearm,
  rearm-without-silence) rather than only testing them together; the `dive-pref` channel carrying
  the preference into a child whose own `localStorage` is deliberately made to throw (simulating a
  non-shared-storage/`file://` child) plus a wrong-session `dive-pref` rejection; export
  byte-identity across an active dwell preview; and the live-status-region DOM text check.

## PR template fields (CONTRIBUTING.md's evidence-by-impact table, REVIEWING.md §1-§3)

**Impact class**: Phase A (camera gestures) is *Shared behavior* (Viewer geometry/interaction,
affects every diagram type); Phase B (dive) is *Local behavior* (one opt-in, off-by-default
feature) that touches shared Viewer files but changes nothing for a reader who never enables it.

**Actual results / exceptions**: same full-suite run as PR1 (1609 tests, 1602 pass, 2 fail — both
in files this PR doesn't touch, pass in isolation, assessed but not conclusively proven as
concurrent-load timing flakes; see PR1's own note). `viewer-wheel-browser.test.mjs` — the file
covering this PR's own Phase A camera gestures — was found to have a load-sensitive flake, was
misdiagnosed once as product-caused, and was reverted to its last-accepted state pending a
follow-up determinism pass; **that follow-up is not part of this PR**. Screen-reader behavior for
Phase B's live region is asserted only via DOM text, never with a real assistive-technology tool.

**Visual evidence**: none included for Phase A/B's own gesture and dive behavior (browser-test
coverage only); this is a gap to close before real review, not a claim of visual proof already
in hand.

**Generated-file exceptions**: this PR also touches the Viewer template, so it inherits PR1's
same rebuild gap — `docs/cases/archify-self` and `docs/cases/mco-runtime.*`/
`experiments/mco-showcase` are stale relative to this PR's template change and unverified to
rebuild cleanly in the maintainer's environment.

## Known limitations

- The `minZoomOut`/redive-lock contract identifies a gesture as `(source, gestureId)`; this is
  sufficient for the wheel and touch sources implemented here but is a contract new gesture
  sources must also honor, not an automatic guarantee.
- No physical-gesture-identity guarantee in an absolute sense — the 400ms silence + re-arm
  combination is a sufficient *behavioral* contract under the existing camera event stream, not a
  hardware-level claim about what a "gesture" is.
- Screen-reader behavior for the live region is asserted only via DOM text content in this repo's
  test suite; it has not been manually verified with an actual assistive-technology tool.
