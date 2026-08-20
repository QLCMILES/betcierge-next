// ── Research Requirements Config ─────────────────────────────────────────
// The single source of truth for what evidence Stage 2 (research-scheduler)
// must establish for a given sport + bet type, converted from the legacy
// generate-picks handicapping playbook into structured, per-bet-type
// requirement sets.
//
// Design (from the Aug 20 three-way review, all binding):
//  - Requirements are DATA keyed by sport × market, consumed by one generic
//    engine — NOT hard-coded prompt prose. Adding NFL/NCAAF later is a new
//    config block here, not a rewrite of research-scheduler's logic.
//  - Each requirement is a stable string key. The engine turns the selected
//    keys into prompt instructions and into the required-slot list the
//    code-owned stopping loop checks against.
//  - `_baseline` applies to EVERY market for that sport. Per-market lists
//    add only what's market-specific on top.
//  - Two keys are HARD CODE GATES (verified against MLB Stats API, not the
//    model's self-report): starter_confirmed_both, and lineup_confirmed for
//    props. Marked with hardGate: true in REQUIREMENT_META below.
//
// Miles's Aug 20 sign-offs baked in:
//  - Bullpen: full availability + recent workload, both teams, in _baseline.
//  - material_conditions (weather/injury/other decisive factor): a slot on
//    EVERY market. Light weight for MLB; will be heavy-weight baseline for
//    football when that config block is added.

// Human-readable research instruction for each requirement key. The engine
// composes the selected keys' instructions into the Stage 2 prompt, so the
// model is told specifically WHAT to establish — not a generic "do research."
// Keep each instruction concrete and about the evidence to establish, not
// the number of searches to run (searches are a guardrail, coverage is the
// objective).
export const REQUIREMENT_META = {
  // ── Baseline (every MLB market) ──
  starter_confirmed_both: {
    label: 'Both starting pitchers confirmed',
    instruction: "Confirm BOTH starting pitchers for this game via a dated source today (e.g. MLB.com probable pitchers). State each by name with the source.",
    hardGate: true, // verified in code against MLB Stats API; model claim that contradicts the API = reject
  },
  starter_recent_form_both: {
    label: 'Both starters recent form',
    instruction: "Establish each starter's RECENT form — last 3 starts (ERA, hits, runs, command), NOT season averages. Recent form beats season stats when they disagree.",
  },
  bullpen_availability_workload_both: {
    label: 'Bullpen availability + workload, both teams',
    instruction: "Establish BOTH bullpens' availability AND recent workload — innings/high-leverage arms used the last 1-3 days, and who is therefore unavailable or short tonight. A tired pen gives up late runs and blows leads; this matters for the whole game, not just the closer.",
  },
  line_movement_and_price: {
    label: 'Line movement + price',
    instruction: "Check line movement (open vs current) and where sharp money points. HARD PRICE RULE: never recommend any pick — ML, run line, or total — at -200 or worse; take the alternate side/line or pass.",
  },
  material_conditions: {
    label: 'Material conditions (weather/injury/other)',
    instruction: "Note any genuinely decisive material condition — weather (wind/temp), a headline injury, a park quirk, or anything that materially changes this specific bet. For MLB this is usually light, but flag it if it's real. If nothing material, say so explicitly.",
  },

  // ── Offense / matchup ──
  opposing_offense_recent_form: {
    label: 'Opposing offense recent form',
    instruction: "Establish the opposing offense's recent form — last 10 games, run differential, hot or cold RIGHT NOW. Never skip the offense to focus only on pitching.",
  },
  opposing_offense_handedness_splits: {
    label: 'Opposing offense handedness splits',
    instruction: "Establish the opposing lineup's splits (wRC+/OPS) against THIS starter's throwing hand (LHP/RHP). A lineup that mashes lefties vs a lefty starter is a real signal.",
  },
  opposing_offense_output_both: {
    label: "Both teams' recent offensive output",
    instruction: "For a total, establish BOTH teams' real recent offensive output (runs last 7-14 days, not just the pitching matchup). Totals built on pitching narratives alone without weighing both offenses have measurably underperformed.",
  },

  // ── Run line / spread specific ──
  bullpen_depth_margin_context: {
    label: 'Bullpen depth for margin',
    instruction: "Beyond baseline availability, assess bullpen DEPTH as it bears on the margin — can this pen protect (or extend) a multi-run margin across innings 6-9 without a soft arm giving back the cover?",
  },
  park_factor: {
    label: 'Park factor',
    instruction: "Establish this park's run/HR factor and how it bears on this pick (suppresses or inflates).",
  },
  park_factor_light: {
    label: 'Park factor (secondary)',
    instruction: "Note the park's run factor as secondary context for this F5 pick (lighter weight than a full-game total).",
  },

  // ── Total specific ──
  umpire_strikezone: {
    label: 'Umpire strike-zone tendency',
    instruction: "Establish the assigned home-plate umpire's strike-zone tendency (larger zone = more Ks/fewer walks, favors under; tighter zone favors over). If the assignment isn't posted yet, mark unavailable — do not guess.",
  },
  bullpen_fatigue_both: {
    label: 'Bullpen fatigue, both sides (totals)',
    instruction: "For a total specifically, establish whether EITHER bullpen threw heavy innings the last 1-2 days — tired pens give up late runs and favor the over. Both sides.",
  },
  weather_detail: {
    label: 'Weather detail (totals)',
    instruction: "Establish wind speed/direction and temperature and how it affects carry (wind out favors over, wind in / cold favors under).",
  },

  // ── F5 specific ──
  starter_durability_tto_both: {
    label: 'Starter durability / times-through-order',
    instruction: "Assess each starter's effectiveness deterioration the 2nd/3rd time through the order (not just whether he reaches the 5th) — for an F5 wager, TTO decline can decide that fifth inning. Use pitch-count/durability data where the sample supports it.",
  },
  starter_avg_innings_last5_both: {
    label: 'Starter avg innings last 5',
    instruction: "Establish each starter's average innings over the last 5 starts — does he typically pitch through the 5th?",
  },

  // ── Prop specific ──
  lineup_confirmed: {
    label: 'Lineup confirmed (prop)',
    instruction: "Confirm the relevant player is actually in today's lineup (and for a strikeout prop, that the opposing high-K bats are starting). If the lineup isn't posted, mark unavailable.",
    hardGate: true, // verified in code against MLB Stats API — not a research task
  },
  player_recent_form: {
    label: 'Player recent form',
    instruction: "Establish the player's recent form — last 5 games/starts, actual numbers.",
  },
  player_handedness_splits: {
    label: 'Player handedness splits',
    instruction: "Establish the player's platoon/handedness splits relevant to tonight's matchup.",
  },
  lineup_position: {
    label: 'Lineup position',
    instruction: "Establish the player's expected lineup position (drives plate appearances / opportunity for the prop).",
  },
  opposing_starter_allowed_profile: {
    label: 'Opposing starter allowed profile',
    instruction: "Establish what the opposing starter allows relevant to this prop category (e.g. HR/9, hits/9, K-rate vs this handedness).",
  },
  park_or_category_factor: {
    label: 'Park / category factor',
    instruction: "Establish the park or category factor relevant to this prop (e.g. HR park factor for a HR prop, K rate for a strikeout prop).",
  },
  bvp_history_supplementary: {
    label: 'Batter-vs-pitcher history (supplementary)',
    instruction: "Batter-vs-pitcher career history is SUPPLEMENTARY, used ONLY when the sample is meaningfully large. Small BvP samples are contaminated by age, arsenal changes, and park — never treat a tiny BvP line as primary evidence.",
    supplementary: true, // never a required primary slot; informs only when sample is meaningful
  },
};

// ── The requirement sets, keyed by sport × market ────────────────────────
// _baseline applies to every market for that sport; per-market arrays add
// only the market-specific requirements on top. The engine merges
// _baseline + REQUIREMENTS[sport][market] to get the full required set.
export const REQUIREMENTS = {
  MLB: {
    _baseline: [
      'starter_confirmed_both',
      'starter_recent_form_both',
      'bullpen_availability_workload_both',
      'line_movement_and_price',
      'material_conditions',
    ],
    moneyline: [
      'opposing_offense_recent_form',
      'opposing_offense_handedness_splits',
    ],
    spread: [
      'opposing_offense_recent_form',
      'opposing_offense_handedness_splits',
      'bullpen_depth_margin_context',
      'park_factor',
    ],
    total: [
      'park_factor',
      'umpire_strikezone',
      'bullpen_fatigue_both',
      'weather_detail',
      'opposing_offense_output_both',
    ],
    f5: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
      'opposing_offense_handedness_splits',
      'park_factor_light',
    ],
    // first_half is the same handicapping question as F5 in MLB (starters +
    // early offense decide it), so it gets the identical requirement set
    // rather than falling back to baseline-only. Kept as its own entry (not
    // an alias) so it can diverge later if sub-market taxonomy is built.
    first_half: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
      'opposing_offense_handedness_splits',
      'park_factor_light',
    ],
    prop: [
      'lineup_confirmed',
      'player_recent_form',
      'player_handedness_splits',
      'lineup_position',
      'opposing_starter_allowed_profile',
      'park_or_category_factor',
      'bvp_history_supplementary',
    ],
  },
  // NFL / NCAAF: added later as their own blocks, same engine. When added,
  // material_conditions (weather) becomes heavy-weight and the "starter"
  // keys are replaced by unit-metric keys (o-line, secondary grades, QB
  // status) per the review's football-templating note.
};

// Bet types Layer 1 can classify. Anything not in REQUIREMENTS[sport] falls
// back to _baseline only (engine handles this) so an unmapped market never
// crashes — it just researches the baseline. first_half maps to the same
// shape as f5 conceptually but is kept distinct for future sub-market work.
export const KNOWN_MARKETS = ['moneyline', 'spread', 'total', 'f5', 'first_half', 'prop'];

// ── The generic engine ───────────────────────────────────────────────────

// Returns the full ordered list of requirement KEYS for a sport+market:
// baseline first, then market-specific, de-duplicated (a market array may
// legitimately repeat a baseline-adjacent key; we never want it twice).
// Unknown sport → empty array (caller decides fallback). Unknown market for
// a known sport → baseline only.
export function getRequirementKeys(sport, betType) {
  const sportBlock = REQUIREMENTS[sport];
  if (!sportBlock) return [];
  const baseline = sportBlock._baseline || [];
  const marketSpecific = sportBlock[betType] || [];
  const seen = new Set();
  const ordered = [];
  for (const key of [...baseline, ...marketSpecific]) {
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

// Whether a sport+market has a REAL, market-specific requirement set — i.e.
// the market is explicitly mapped, not just falling back to baseline-only.
// research-scheduler uses this to FAIL SAFE: if Layer 1 ever hands over a
// bet_type we don't have a full playbook for, the candidate is refused (not
// published on baseline-only research) and logged loudly for attention.
// In normal operation this is always true — Layer 1's bet_type enum is
// fully mapped for MLB — so this only fires if something upstream produces
// an unexpected market, which is exactly when publishing an under-researched
// pick would be the wrong outcome. A missing/skipped edge-case pick is cheap;
// a published pick backed by research we can't vouch for is not.
export function isMarketFullyMapped(sport, betType) {
  const sportBlock = REQUIREMENTS[sport];
  if (!sportBlock) return false;
  const marketSpecific = sportBlock[betType];
  return Array.isArray(marketSpecific) && marketSpecific.length > 0;
}

// The subset of a requirement set that must be verified in CODE against a
// structured source (MLB Stats API), not trusted from the model's self-
// report. Used by the downstream hard-gate step in research-scheduler.
export function getHardGateKeys(sport, betType) {
  return getRequirementKeys(sport, betType).filter(
    k => REQUIREMENT_META[k]?.hardGate === true
  );
}

// The subset that is SUPPLEMENTARY — present in the prompt as "use only if
// sample is meaningful," but NOT counted as a required slot by the code-
// owned stopping loop (so the model isn't forced to loop forever chasing a
// BvP line that doesn't meaningfully exist).
export function getSupplementaryKeys(sport, betType) {
  return getRequirementKeys(sport, betType).filter(
    k => REQUIREMENT_META[k]?.supplementary === true
  );
}

// The required slots the stopping loop checks: every requirement key EXCEPT
// supplementary ones. Each of these must come back with an explicit status
// (supported | unavailable | conflicting) before the model is allowed to
// finalize; a missing/empty one forces it back to search.
export function getRequiredSlotKeys(sport, betType) {
  const supplementary = new Set(getSupplementaryKeys(sport, betType));
  return getRequirementKeys(sport, betType).filter(k => !supplementary.has(k));
}

// Composes the human-readable research instructions for the selected
// requirement set, numbered, for injection into the Stage 2 prompt. Marks
// hard-gate items and supplementary items inline so the model knows which
// are which. Unknown keys are skipped defensively (should never happen, but
// a typo in REQUIREMENTS shouldn't emit "undefined" into the prompt).
export function buildRequirementInstructions(sport, betType) {
  const keys = getRequirementKeys(sport, betType);
  const lines = [];
  let n = 1;
  for (const key of keys) {
    const meta = REQUIREMENT_META[key];
    if (!meta) continue; // defensive: skip an unknown key rather than emit undefined
    let tag = '';
    if (meta.hardGate) tag = ' [REQUIRED — will be verified against official data]';
    else if (meta.supplementary) tag = ' [supplementary — only if sample is meaningful]';
    lines.push(`${n}. ${meta.label}: ${meta.instruction}${tag}`);
    n += 1;
  }
  return lines.join('\n');
}
