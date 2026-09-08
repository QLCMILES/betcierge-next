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
//    add only what's genuinely market-specific on top.
//  - Two keys are HARD CODE GATES (verified against MLB Stats API, not the
//    model's self-report): starter_confirmed_both, and lineup_confirmed for
//    props. Marked with hardGate: true.
//
// Baseline philosophy (Miles, Aug 20): baseball is streaky and these factors
// tie into EVERY pick regardless of bet type — so the heavy handicapping core
// lives in baseline and every MLB pick runs it. Recent offensive form (both
// teams), each lineup vs today's opposing starter, the starting-pitching
// matchup edge, and the full bullpen picture (availability + workload/fatigue
// + depth, both teams) are baseline, not market-specific add-ons. Market
// add-ons are only the genuinely bet-specific extras (park/umpire/weather for
// totals, etc.). This is a deliberate quality-for-cost trade — more research
// per pick — explicitly chosen for "best picks possible."

export const REQUIREMENT_META = {
  // ── Baseline (every MLB market) ──
  starter_confirmed_both: {
    label: 'Both starting pitchers confirmed',
    instruction: "Confirm BOTH starting pitchers for this game via a dated source today (e.g. MLB.com probable pitchers). State each by name with the source. If any source disagrees with the team's own official probable-pitchers page, the official page wins — do not override it based on an older preview article or your own reasoning about which seems more likely.",
    hardGate: true, // verified in code against MLB Stats API; model claim contradicting the API = reject
    turn1: true, // Aug 24: always establish the hard gate first — if this can't be confirmed, nothing else matters
  },
  starter_recent_form_both: {
    label: 'Both starters recent form',
    instruction: "Establish each starter's RECENT form — last 3 starts (ERA, hits, runs, command), NOT season averages. Recent form beats season stats when they disagree.",
    turn1: true, // Aug 24: pairs with starting_pitching_matchup_edge — same searches largely cover both
  },
  starting_pitching_matchup_edge: {
    label: 'Starting pitching matchup edge',
    instruction: "Compare the two starters against EACH OTHER and state who has the edge tonight and by how much — this is the pitching-mismatch assessment (not head-to-head history; they don't face each other). Base it on the recent-form and stuff of each arm, not season reputation.",
    turn1: true, // Aug 24: the core skill-edge assessment; depends on starter_recent_form_both, do together
  },
  offense_recent_form_both: {
    label: "Both teams' recent offensive form",
    instruction: "Establish BOTH teams' recent offensive form — last 7-10 days / last 10 games (runs scored, run differential, hot or cold RIGHT NOW). Baseball is streaky; how each lineup is actually swinging the bat this week matters to every bet type, not just totals.",
  },
  lineup_vs_todays_starter_both: {
    label: "Each lineup vs today's opposing starter",
    instruction: "For BOTH teams, establish how that lineup matches up against the specific pitcher they face tonight — handedness splits (wRC+/OPS vs LHP/RHP as applicable) plus any meaningful history/trend against that arm or that pitch profile.",
  },
  bullpen_full_assessment_both: {
    label: 'Full bullpen assessment, both teams',
    instruction: "Establish the COMPLETE bullpen picture for BOTH teams — address all three: (1) availability — who is unavailable or limited tonight; (2) recent workload/fatigue — innings and high-leverage arms used the last 1-3 days; (3) depth — how many reliable arms deep each pen is before a soft spot. This decides late-inning outcomes for every bet type: holding a lead (ML), protecting/extending a margin without a soft arm giving back the cover (run line), and late runs pushing a total. Address availability, workload/fatigue, AND depth — do not report only one.",
  },
  line_movement_and_price: {
    label: 'Line movement + price',
    instruction: "Check line movement (open vs current) and where sharp money points. HARD PRICE RULE: never recommend any pick — ML, run line, or total — at -200 or worse; take the alternate side/line or pass.",
    turn1: true, // Aug 24: fast to check, and decides viability — no point researching deeper on an unbettable price
  },
  material_conditions: {
    label: 'Material conditions (weather/injury/other)',
    instruction: "Note any genuinely decisive material condition — weather (wind/temp), a headline injury, a park quirk, or anything that materially changes this specific bet. For MLB this is usually light, but flag it if it's real. If nothing material, say so explicitly.",
  },

  // ── Total specific ──
  park_factor: {
    label: 'Park factor',
    instruction: "Establish this park's run/HR factor and how it bears on this pick (suppresses or inflates scoring).",
  },
  umpire_strikezone: {
    label: 'Umpire strike-zone tendency',
    instruction: "Establish the assigned home-plate umpire's strike-zone tendency (larger zone = more Ks/fewer walks, favors under; tighter zone favors over). If the assignment isn't posted yet, mark unavailable — do not guess.",
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

  // ── Football (NFL + NCAAF) ───────────────────────────────────────────────
  // Built Sep 8 from Miles's 6 core signals + the three-way review synthesis
  // (ChatGPT/Manus/Gemini). Shared by both NFL and NCAAF via FOOTBALL_BASELINE;
  // NCAAF adds recruiting/home-field on top. Design decisions encoded here:
  //  - Injuries are CRITICAL but NOT a code hard gate (no structured football
  //    injury feed integrated; all three reviewers agreed). "Questionable"
  //    RESOLVES the slot (official designation found) — only a failed lookup of
  //    a bet-material player is unresolved. Provenance (official report vs. web)
  //    stated in the finding.
  //  - QB matchup is its own domain (ChatGPT's "missing sixth signal"), not
  //    folded into offensive efficiency.
  //  - Rivalry/motivation is NOT a slot (all three: narrative trap) — it lives
  //    in Stage 2 framing prose, not here. Only verifiable facts are slots.
  //  - Week-1/early-season thin-sample handling is baked into the efficiency
  //    and injury instructions (no real current-season sample yet).
  offensive_efficiency_both: {
    label: "Both teams' offensive efficiency",
    instruction: "Establish BOTH teams' offensive efficiency — EPA/play or DVOA, yards/play, red-zone TD%, and third-down conversion. Weight recent form over season average when they diverge. EARLY SEASON: if fewer than 3 games have been played this season, say so explicitly, lean on returning production / prior-season efficiency with an explicit staleness caveat, and flag the sample as thin — do NOT present a stale or tiny sample as if it were settled.",
    turn1: true,
  },
  defensive_efficiency_both: {
    label: "Both teams' defensive efficiency",
    instruction: "Establish BOTH teams' defensive efficiency — defensive EPA/play or DVOA, success rate allowed, red-zone defense, and third-down stop rate. Weight recent form over season average when they diverge. EARLY SEASON: if fewer than 3 games have been played this season, say so explicitly, lean on returning production / prior-season data with a staleness caveat, and flag the sample as thin.",
    turn1: true,
  },
  qb_form_and_matchup_both: {
    label: "Both QBs' form + matchup",
    instruction: "For BOTH starting QBs, establish more than raw completion%/YPA: recent efficiency, performance under pressure, turnover-worthy-play / interception tendency, mobility where relevant, and specifically how each QB projects against THIS opponent's coverage and pressure profile. The core question is 'can this quarterback function against what this defense does' — answer it directly, not with a generic team-offense number.",
    turn1: true,
  },
  trenches_matchup: {
    label: 'Trenches matchup (O-line vs D-line)',
    instruction: "Establish who wins in the trenches, both directions: O-line run-block grade vs. opposing run-defense, and O-line pass-protection grade vs. opposing pass-rush (PFF or equivalent win rates). This is a primary handicapping signal, not a footnote — a decisive trench edge often drives the whole game.",
    turn1: true,
  },
  pass_rush_pressure: {
    label: 'Pass rush / QB pressure',
    instruction: "Establish each defense's ability to pressure the QB — pressure rate, sack rate, and pass-rush win rate, especially WITHOUT blitzing — against the opposing O-line's pass-block win rate and the QB's time-to-throw and sacks taken. A defense that generates pressure with four is a real, often underpriced edge; a QB who folds under pressure against a strong rush is a real fade.",
    turn1: true,
  },
  key_injuries_both: {
    label: 'Key injuries / availability, both teams',
    instruction: "Establish the availability of every player MATERIAL to this specific bet on BOTH teams — the starting QB always, plus any player whose absence would move this line (LT vs. a top edge rusher, WR1, a defense's key pass rusher, a lead back for a total). Report each by official designation (Out / Doubtful / Questionable / Probable / Available). CRITICAL DISTINCTION: an official 'Questionable' (or any posted designation) RESOLVES this slot — you found the official status; then weigh it in the pick. The slot is UNRESOLVED only when a bet-material player's status could not be established at all. State provenance in the finding: whether each status came from an official team/conference/league report (high confidence) or was inferred from news/beat coverage (lower confidence). NCAAF NOTE: Power 4 conferences (SEC, Big Ten, Big 12, ACC) now publish enforced availability reports; Group of 5 / FCS programs often do not — if a bet-material player's status genuinely cannot be found for such a game, mark unavailable and say what you checked.",
    turn1: true,
  },
  key_number_awareness: {
    label: 'Key-number awareness (spread)',
    instruction: "For this spread, establish exactly where the current number sits relative to football's key margins — 3, 7, 10, 14 — and treat the half-point hook lines (3.5, 7.5, 10.5) as their own distinct signal, NOT a rounding detail: +3.5 covers a 3-point loss that +3 does not; laying -3.5 needs a 4-point win, not just any win. Note whether the line has crossed a key number since open and whether the current price fairly reflects the hook. Never treat -3.5 and -3 (or +2.5 and +3) as the same bet — flag the difference explicitly.",
  },
  weather_detail_football: {
    label: 'Weather detail (football totals)',
    instruction: "Establish game-time wind, precipitation, and temperature and how they bear on this total. Wind 15+ mph meaningfully suppresses the passing game and kicking (favors under); heavy precipitation and extreme cold do the same. Dome/retractable-roof games negate this — say so. If the forecast isn't reliable yet (more than ~48h out), mark unavailable rather than guessing.",
  },
  pace_and_script_fit: {
    label: 'Pace + game-script fit',
    instruction: "Establish both teams' pace (seconds/play, plays/game) and the likely game script — who is expected to lead/trail and how that shapes run/pass volume and clock. A total lives or dies on pace and script; a spread can hinge on whether the favorite's script runs up the score or milks the clock.",
  },
  recruiting_talent_gap: {
    label: 'Recruiting / roster talent gap (NCAAF)',
    instruction: "Establish the roster-talent gap between the two programs — recruiting composite (e.g. 247 team talent), blue-chip ratio, returning production, and net transfer-portal movement. In college the raw talent disparity between programs is often the single biggest driver, especially Power 4 vs. Group of 5 or FCS. This is a season-stable prior, answerable once — not per-game breaking news.",
  },
  home_field_and_crowd: {
    label: 'Home field / crowd (NCAAF)',
    instruction: "Establish this venue's home-field effect where it's quantifiable — home/road ATS splits, crowd-driven false-start/quiet-count disruption, altitude or unusual travel, and notable environment. Treat as a supporting prior, not per-game news. Do not inflate it into a decisive factor without real evidence.",
  },
};

// ── The requirement sets, keyed by sport × market ────────────────────────
// _baseline applies to every market; per-market arrays add only the
// market-specific extras. The engine merges _baseline + REQUIREMENTS[sport][market].
// An empty market array (e.g. MLB moneyline) is legitimate and intended — it
// means baseline fully covers that bet. isMarketFullyMapped() treats a market
// as mapped if it's a key in the sport block at all (even with an empty
// array), so an intentionally-empty add-on is NOT mistaken for an unmapped market.
// Shared football core (Fork 1, Sep 8): the 6 signals every football pick runs,
// referenced by both the NFL and NCAAF blocks below so the common set is
// defined once. Order is the research priority order (all six are turn1).
const FOOTBALL_BASELINE = [
  'offensive_efficiency_both',
  'defensive_efficiency_both',
  'qb_form_and_matchup_both',
  'trenches_matchup',
  'pass_rush_pressure',
  'key_injuries_both',
];

export const REQUIREMENTS = {
  MLB: {
    _baseline: [
      'starter_confirmed_both',
      'starter_recent_form_both',
      'starting_pitching_matchup_edge',
      'offense_recent_form_both',
      'lineup_vs_todays_starter_both',
      'bullpen_full_assessment_both',
      'line_movement_and_price',
      'material_conditions',
    ],
    // Baseline fully covers a "who wins" bet — no moneyline-specific add-on.
    moneyline: [],
    spread: [
      'park_factor',
    ],
    total: [
      'park_factor',
      'umpire_strikezone',
      'weather_detail',
    ],
    f5: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
    ],
    // first_half is the same handicapping question as F5 in MLB — identical set.
    first_half: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
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
  // ── Football (NFL + NCAAF) ─────────────────────────────────────────────
  // Fork 1 (resolved Sep 8): two separate sport blocks, but the shared 6-signal
  // baseline is declared ONCE below (FOOTBALL_BASELINE) and referenced by both,
  // so there's a single source of truth for what's common and clean separation
  // for what differs (NCAAF's critical list and add-ons legitimately diverge
  // from NFL's — see CRITICAL / CRITICAL_UNAVAILABLE_ALLOW).
  NFL: {
    _baseline: [...FOOTBALL_BASELINE],
    // Baseline fully covers a straight who-wins bet.
    moneyline: [],
    spread: [
      'key_number_awareness',
    ],
    total: [
      'weather_detail_football',
      'pace_and_script_fit',
    ],
    // NFL first half — same core handicap, no first-half-specific add-on yet.
    first_half: [],
    prop: [
      // Props lean on the baseline (QB/efficiency/injuries already cover most
      // player context); no football prop-specific slots defined yet.
    ],
  },
  NCAAF: {
    // Same 6-signal core as NFL, plus the two college-specific priors.
    _baseline: [
      ...FOOTBALL_BASELINE,
      'recruiting_talent_gap',
      'home_field_and_crowd',
    ],
    moneyline: [],
    spread: [
      'key_number_awareness',
    ],
    total: [
      'weather_detail_football',
      'pace_and_script_fit',
    ],
    first_half: [],
    prop: [],
  },
};

// ── Critical slots, keyed by sport × market ──────────────────────────────
// Criticality is MARKET-DEPENDENT (e.g. park_factor is critical for a total
// but not for a spread), so it's defined per-market here rather than as a flat
// flag on the requirement. A slot listed here means: if it is unresolved at
// the research ceiling (never reported at all), the pick is REFUSED. A slot
// NOT listed here is non-critical — a strong pick may publish even if that
// slot never resolved.
//
// This is the handicapper's judgment (Miles, Aug 20) encoded in code — the
// gate keys ONLY on these flags, NOT on the model's self-reported `importance`
// field (which is kept as audit data but never trusted for the gate, so the
// model can't rate its own gap as "minor" to escape).
//
// IMPORTANT: hard-gate keys (starter_confirmed_both, lineup_confirmed) are
// ALWAYS critical regardless of what's listed here — getCriticalSlotKeys()
// unions them in defensively so a hard gate can never be accidentally omitted.
//
// `unavailable` on a NON-CRITICAL slot counts as RESOLVED (publishable). For a
// CRITICAL slot, `unavailable` is governed by CRITICAL_UNAVAILABLE_ALLOW below:
// the default is REFUSE, with per-slot exceptions declared explicitly. A
// critical slot that is never reported at all always triggers refusal.
// (Resolved Aug 20 three-way review — this replaces the earlier "unavailable =
// resolved for all slots" behavior, which left the critical gate bypassable.)
export const CRITICAL = {
  MLB: {
    _baseline: [
      'starter_confirmed_both',        // hard gate
      'starter_recent_form_both',
      'starting_pitching_matchup_edge',
      'offense_recent_form_both',
      'bullpen_full_assessment_both',
      'line_movement_and_price',
      // NON-critical baseline (publishable without, if genuinely missing):
      //   material_conditions        — catch-all; nothing material = trivially resolved
      //   lineup_vs_todays_starter_both — a strong pick may publish without it (Miles override)
    ],
    moneyline: [],   // baseline critical set fully governs a who-wins bet
    spread: [
      // park_factor is NON-critical for a spread (secondary; affects margin not outcome)
    ],
    total: [
      'park_factor',      // critical for a total — fundamental run environment
      'weather_detail',   // critical for a total — affects carry/scoring
      // umpire_strikezone is NON-critical: often not posted until late, legitimately unavailable
    ],
    f5: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
    ],
    first_half: [
      'starter_durability_tto_both',
      'starter_avg_innings_last5_both',
    ],
    prop: [
      'lineup_confirmed',                 // hard gate
      'player_recent_form',
      'opposing_starter_allowed_profile',
      // NON-critical: player_handedness_splits, lineup_position, park_or_category_factor
    ],
  },
  NFL: {
    // All 6 core signals are critical — Miles's baseline is the handicap.
    // key_injuries_both is critical but NOT a hard gate (no structured feed);
    // "Questionable" resolves it, only a failed lookup of a bet-material player
    // leaves it unresolved. See CRITICAL_UNAVAILABLE_ALLOW (NFL: none — an
    // NFL "unavailable" is a research failure, not a data reality).
    _baseline: [
      'offensive_efficiency_both',
      'defensive_efficiency_both',
      'qb_form_and_matchup_both',
      'trenches_matchup',
      'pass_rush_pressure',
      'key_injuries_both',
    ],
    moneyline: [],
    spread: [
      'key_number_awareness',   // critical for a spread (Miles: key numbers decide spreads)
    ],
    total: [
      'weather_detail_football',  // critical for a total — wind/precip drive scoring
      'pace_and_script_fit',      // critical for a total — pace/script is the total
    ],
    first_half: [],
    prop: [],
  },
  NCAAF: {
    // Same critical core as NFL. recruiting_talent_gap and home_field_and_crowd
    // are baseline but NON-critical — strong priors that inform, never block
    // (a G5 game with no talent-composite data should still be pickable).
    _baseline: [
      'offensive_efficiency_both',
      'defensive_efficiency_both',
      'qb_form_and_matchup_both',
      'trenches_matchup',
      'pass_rush_pressure',
      'key_injuries_both',
    ],
    moneyline: [],
    spread: [
      'key_number_awareness',
    ],
    total: [
      'weather_detail_football',
      'pace_and_script_fit',
    ],
    first_half: [],
    prop: [],
  },
};

// ── Unavailable policy for CRITICAL slots ────────────────────────────────
// Decision (Aug 20, post three-way review): a CRITICAL slot returning
// `unavailable` after real searching does NOT automatically count as resolved.
// This closes the escape hatch the review flagged — otherwise the strongest
// gate could be bypassed by the model simply reporting `unavailable`.
//
// Default policy for EVERY critical slot: REFUSE. If the handicapper declared
// this evidence necessary for the bet, inability to establish it should
// prevent publication — that is what "critical" means. Non-critical slots are
// unaffected: `unavailable` on a non-critical slot is always fine to publish.
//
// A slot is listed here ONLY to grant an explicit exception — publish the pick
// even when this critical slot is `unavailable`. Reserve it for a datum that
// is (a) legitimately not knowable until close to game time AND (b) one the
// bet can genuinely survive without.
//
// MLB today: intentionally EMPTY. The genuinely often-unavailable MLB slot
// (umpire_strikezone) is already NON-critical, so no critical MLB slot needs
// an allow-exception. The mechanism exists for future sports / tuning; do not
// add an entry without Miles's sign-off, since it directly weakens a gate.
export const CRITICAL_UNAVAILABLE_ALLOW = {
  MLB: {
    // slot_key: true,   // ← publish even if this CRITICAL slot is `unavailable`
  },
  // NFL: intentionally EMPTY. Power/pro injury reporting is mandated and
  // enforced, so an NFL injury slot coming back `unavailable` is a research
  // failure, not a data reality — refuse, don't publish blind.
  NFL: {},
  // NCAAF (Fork 3, Miles Sep 8): allow key_injuries_both to publish when
  // genuinely `unavailable`. Rationale: Group of 5 / FCS programs are not
  // required to publish availability reports, so for those games the info may
  // truly not exist (vs. "wasn't found"). Miles keeps G5 in because those soft
  // lines are a real profit center — cutting them to avoid the data gap would
  // throw out the edge. The instruction already forces the model to (a) confine
  // "unavailable" to bet-MATERIAL players and (b) state what it checked, so a
  // Power 4 game (which does publish) should essentially never hit this path.
  NCAAF: {
    key_injuries_both: true,
  },
};

// Returns true if a critical slot coming back `unavailable` must REFUSE the
// pick (the default), false if an explicit exception permits publishing anyway.
// Only meaningful for slots that are actually critical for the market — the
// loop consults this only after getCriticalSlotKeys() says the slot is critical.
export function criticalUnavailableRefuses(sport, slot) {
  const allowed = CRITICAL_UNAVAILABLE_ALLOW[sport]?.[slot] === true;
  return !allowed; // default: refuse
}

// Bet types Layer 1 can classify. Anything not mapped for a sport is caught
// by isMarketFullyMapped() and fails safe rather than researching baseline-only.
export const KNOWN_MARKETS = ['moneyline', 'spread', 'total', 'f5', 'first_half', 'prop'];

// ── The generic engine ───────────────────────────────────────────────────

// Full ordered list of requirement KEYS for a sport+market: baseline first,
// then market-specific, de-duplicated. Unknown sport → empty array (caller
// decides fallback). A mapped market with an empty add-on (e.g. MLB moneyline)
// correctly returns just the baseline.
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

// Whether a sport+market is a REAL, intended market — i.e. the market key
// exists in the sport block at all (even as an empty array, which means
// "baseline fully covers it"). research-scheduler uses this to FAIL SAFE: if
// Layer 1 ever hands over a bet_type that is NOT an intended market for this
// sport, the candidate is refused and logged, never published on baseline-
// only research. Crucially this returns TRUE for MLB moneyline (empty add-on
// but intended) and FALSE for a genuinely unmapped/unexpected market.
export function isMarketFullyMapped(sport, betType) {
  const sportBlock = REQUIREMENTS[sport];
  if (!sportBlock) return false;
  return Object.prototype.hasOwnProperty.call(sportBlock, betType);
}

// Keys that must be verified in CODE against a structured source (MLB Stats
// API), not trusted from the model's self-report.
export function getHardGateKeys(sport, betType) {
  return getRequirementKeys(sport, betType).filter(
    k => REQUIREMENT_META[k]?.hardGate === true
  );
}

// Supplementary keys — present in the prompt as "use only if sample is
// meaningful," but NOT counted as a required slot by the stopping loop.
export function getSupplementaryKeys(sport, betType) {
  return getRequirementKeys(sport, betType).filter(
    k => REQUIREMENT_META[k]?.supplementary === true
  );
}

// The CRITICAL required slots for a sport+market: if any of these is
// unresolved at the research ceiling, the pick is refused. Built from the
// per-market CRITICAL config, UNIONed with hard-gate keys (which are always
// critical), and INTERSECTED with the market's actual required slots (so a
// critical key that doesn't apply to this market can't leak in). Returns a
// subset of getRequiredSlotKeys(sport, betType).
export function getCriticalSlotKeys(sport, betType) {
  const required = new Set(getRequiredSlotKeys(sport, betType));
  const criticalBlock = CRITICAL[sport] || {};
  const baselineCritical = criticalBlock._baseline || [];
  const marketCritical = criticalBlock[betType] || [];
  const hardGates = getHardGateKeys(sport, betType); // always critical
  const union = new Set([...baselineCritical, ...marketCritical, ...hardGates]);
  // Only keep critical keys that are genuinely part of this market's required
  // set — defends against a typo or a stale critical entry for another market.
  return [...union].filter(k => required.has(k));
}

// The required slots the stopping loop checks: every requirement key EXCEPT
// supplementary ones. Each must return an explicit status before finalize.
export function getRequiredSlotKeys(sport, betType) {
  const supplementary = new Set(getSupplementaryKeys(sport, betType));
  return getRequirementKeys(sport, betType).filter(k => !supplementary.has(k));
}

// Turn-1 priority subset (Aug 24): requirement keys the INITIAL research
// call should focus on, so a single turn's real-world latency (search +
// read, server-side, inside one non-streaming call) stays realistic. This
// does NOT change what's required to publish — getRequiredSlotKeys() and the
// critical/gating logic are untouched. It only changes what turn 1 is asked
// to cover; anything not flagged here is picked up by the existing
// continuation-prompt mechanism (buildContinuationPrompt) in turn 2+, which
// already requests exactly the unresolved slots. Root cause: staging tests
// (2/2) on MLB moneyline showed turn 1 timing out at 90s with ZERO searches
// completed when asked to establish all 8 baseline items in one non-
// streaming call — the ask was too big for one turn, not a wiring bug.
// A requirement with no `turn1: true` entries for its sport/market (e.g. a
// future sport not yet tuned) falls back to the full set — see
// getTurn1PriorityKeys()'s caller in researchLoop.js.
export function getTurn1PriorityKeys(sport, betType) {
  return getRequirementKeys(sport, betType).filter(
    k => REQUIREMENT_META[k]?.turn1 === true
  );
}

// Composes the numbered, human-readable research instructions for the
// selected requirement set, for injection into the Stage 2 prompt. Tags
// hard-gate and supplementary items inline. Unknown keys skipped defensively.
// Optional `onlyKeys`: restrict to this subset (e.g. the turn-1 priority
// list) while preserving the requirement set's natural order. Omit for the
// full set (existing behavior, unchanged for any other caller).
export function buildRequirementInstructions(sport, betType, onlyKeys) {
  const allKeys = getRequirementKeys(sport, betType);
  const keys = Array.isArray(onlyKeys) ? allKeys.filter(k => onlyKeys.includes(k)) : allKeys;
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

// ── Evidence validation — the code-owned completion gate ─────────────────
// The research loop (research-scheduler) calls evaluateEvidence() after each
// turn to decide, in CODE, whether the pick's `evidence` array actually
// SATISFIES each required slot — not merely whether the model mentioned it.
// Core of the Aug 20 decision: Claude researches and reports; code decides
// whether the evidence is sufficient to publish.

// Normalize a slot key for matching model output against config keys — trims
// and lowercases, so a stray capital or space in the model's `requirement`
// field doesn't read as a missing slot and burn a turn.
export function normalizeSlotKey(k) {
  return String(k == null ? '' : k).trim().toLowerCase();
}

// Shape classification of ONE evidence entry (or undefined). Pure — knows
// nothing of criticality or policy; only: is this entry well-formed?
//   supported/conflicting need a real finding AND >=1 non-empty source
//   unavailable needs a real finding (why), sources not required
export function classifyEvidenceEntry(entry) {
  if (!entry || typeof entry !== 'object') return 'MISSING';
  const status = normalizeSlotKey(entry.status);
  const finding = String(entry.finding == null ? '' : entry.finding).trim();
  const sources = Array.isArray(entry.sources)
    ? entry.sources.filter(s => typeof s === 'string' && s.trim().length > 0)
    : [];

  if (status !== 'supported' && status !== 'conflicting' && status !== 'unavailable') {
    return 'INVALID_STATUS';
  }
  if (finding.length === 0) return 'INVALID_MISSING_FINDING';
  if (status === 'unavailable') return 'VALID_UNAVAILABLE';
  if (sources.length === 0) return 'INVALID_MISSING_SOURCE';
  return status === 'conflicting' ? 'VALID_CONFLICTING' : 'VALID_SUPPORTED';
}

// Resolution state of ONE required slot: shape classification + criticality +
// per-slot unavailable policy. Returns:
//   'resolved'             done; don't loop back; safe to publish on
//   'needs_research'       missing/malformed; loop back to research it
//   'unavailable_blocking' critical + unavailable + policy=refuse; loop back to
//                          try to establish it, and REFUSE if still this at the
//                          ceiling
export function slotResolutionState(sport, betType, slotKey, entry, criticalSet) {
  const cls = classifyEvidenceEntry(entry);
  const isCritical = criticalSet
    ? criticalSet.has(slotKey)
    : new Set(getCriticalSlotKeys(sport, betType)).has(slotKey);

  if (cls === 'VALID_SUPPORTED' || cls === 'VALID_CONFLICTING') return 'resolved';

  if (cls === 'VALID_UNAVAILABLE') {
    if (!isCritical) return 'resolved';
    return criticalUnavailableRefuses(sport, slotKey) ? 'unavailable_blocking' : 'resolved';
  }

  // MISSING / INVALID_* — slot not satisfied
  return 'needs_research';
}

// Whole-pick evaluation the loop consumes each turn. Normalizes the model's
// evidence array, matches it against the required slots, and returns the
// partitioned view plus the two control flags the loop keys on:
//   isComplete  — nothing left to research (stop early and publish)
//   publishable — no critical slot unresolved (publish at the ceiling,
//                 recording any non-critical gaps)
// Supplementary slots are excluded upstream (getRequiredSlotKeys). Extra and
// duplicate reported slots are surfaced for logging, never used to satisfy a
// gate.
export function evaluateEvidence(sport, betType, pick) {
  const required = getRequiredSlotKeys(sport, betType);
  const criticalSet = new Set(getCriticalSlotKeys(sport, betType));
  const rawEvidence = Array.isArray(pick && pick.evidence) ? pick.evidence : [];

  const entryByKey = new Map();
  const duplicates = [];
  for (const e of rawEvidence) {
    const key = normalizeSlotKey(e && e.requirement);
    if (!key) continue;
    if (entryByKey.has(key)) { duplicates.push(key); continue; }
    entryByKey.set(key, e);
  }

  const requiredNorm = new Set(required.map(normalizeSlotKey));
  const extras = [...entryByKey.keys()].filter(k => !requiredNorm.has(k));

  const perSlot = {};
  const resolved = [];
  const needsResearch = [];
  const unavailableBlocking = [];

  for (const slot of required) {
    const entry = entryByKey.get(normalizeSlotKey(slot));
    const classification = classifyEvidenceEntry(entry);
    const resolution = slotResolutionState(sport, betType, slot, entry, criticalSet);
    perSlot[slot] = { classification, resolution, isCritical: criticalSet.has(slot) };
    if (resolution === 'resolved') resolved.push(slot);
    else if (resolution === 'unavailable_blocking') unavailableBlocking.push(slot);
    else needsResearch.push(slot);
  }

  const unresolved = [...needsResearch, ...unavailableBlocking];
  const criticalUnresolved = unresolved.filter(s => criticalSet.has(s));

  return {
    perSlot,
    resolved,
    needsResearch,
    unavailableBlocking,
    unresolved,
    criticalUnresolved,
    duplicates,
    extras,
    isComplete: unresolved.length === 0,
    publishable: criticalUnresolved.length === 0,
  };
}
