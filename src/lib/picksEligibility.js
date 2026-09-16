// ── Public Picks Record — Eligibility Rule ──────────────────────────────
// Sep 16, 2026: v2 cutover. Fork A (decided Sep 14): eligibility for the
// public record should be derived-in-view (a date/pipeline-source rule),
// not a stored per-pick flag. This is that rule, in exactly one place.
//
// Why this file exists at all: the Sep 15 incident. The public tracker
// (PicksTab's loadHistory, in page.js) and the actual pick cards
// (/api/claude's GET handler) each had their OWN independent
// pipeline_source filter. One had it right, one didn't, and they silently
// disagreed for days before anyone noticed. Two places implementing "the
// same" rule separately is exactly how that happened. This file is the
// fix: ONE rule, imported by both call sites, so they can't drift apart
// again — if this rule is ever wrong, it's wrong in exactly one place,
// visibly, not silently in just one of two copies.
//
// The rule itself: legacy is the public record for any date before the
// cutover; v2 is the public record for the cutover date forward. v2's
// picks over Sep 1–15 (21-16, 56.8%) outperformed legacy's over the same
// window (10-9-3, 52.6%) — Miles's call to backdate the cutover to Sep 1
// rather than today, so the public record reflects the better system for
// that whole window, not just going forward.
//
// Nothing about the underlying data changes. Legacy's real Sep 1–15 rows
// still exist in daily_picks exactly as they were generated — they simply
// stop being what's DISPLAYED for those dates. Moving CUTOVER_DATE is a
// one-line, fully reversible way to undo this if v2 needs rolling back
// (see LEGACY_PIPELINE_ENABLED in generate-picks.js / poll-batch-picks.js
// for the separate, matching decision to pause legacy's pipeline itself).

export const CUTOVER_DATE = '2026-09-01';

// pick: an object with at least { date, pipeline_source } — matches the
// shape of a row from daily_picks either as fetched directly (snake_case)
// or however a caller has already mapped it, as long as these two fields
// are present under these names.
export function isEligibleForPublicRecord(pick) {
  if (!pick || !pick.date || !pick.pipeline_source) return false;
  if (pick.date < CUTOVER_DATE) return pick.pipeline_source === 'legacy';
  return pick.pipeline_source === 'v2';
}
