Draft comment for issue #280. Not posted — requires maintainer/user approval.

---

We looked at this while working on #367's bundle/descend-in-place mechanism and want to flag an
alternative worth considering before #281 (sibling-HTML `href`/`parentHref` navigation) moves
forward as the answer here.

#367's bundle already descends in place — iframe, breadcrumb, silhouette, ACK'd handshake — but is
explicitly capped at two levels (`max_depth: const 2`, `docs/decisions/identity-map-2026-09-09.md`
§7: "No third level"). We have a draft that keeps that same in-place mechanism and generalizes
`max_depth` to a bounded integer (2–8) with a real tree/leaf-mark check replacing the two-level
DAG check, so "zoom into a component" can keep going for as many authored levels as a system
actually has, without a full page navigation or losing camera/viewport state at each hop — which
is the gap that made this issue's page-navigation shape (`href`/`drilldowns[]`/`parentHref`)
attractive over #367 in the first place.

If that's a direction worth exploring, we can open it as a draft PR against `feature/identity-map`
for review; it's additive to #367's existing checks, and a two-level bundle that's already
tree-shaped keeps validating unchanged (byte-identical generated manifest, checked against one
reference fixture — the tree check the depth generalization requires is strictly stricter than
today's DAG check for a shared-child or unreachable-diagram shape, at any depth, so that specific
narrower claim is the honest one). A second, independent piece adds a wheel/pinch zoom gesture
(added unconditionally, not itself opt-in) plus a *separately* default-off "zoom past a threshold
to descend" trigger on top of that gesture — separate PR, since it's a materially different review
surface (camera/gesture contract) from the bundle/schema change.

Happy to open both as drafts if that's useful, or to fold the depth generalization into #367
directly if the maintainer would rather review it there.
