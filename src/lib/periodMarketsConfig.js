// ── Period-Markets Config ────────────────────────────────────────────────
// The single source of truth for which period/sub-game markets v2 can
// source REAL odds for, and which provider market keys back each one.
//
// Sep 10, 2026 three-way review (ChatGPT + Gemini + Manus, unanimous on
// Fork 1): one generalized config across every sport, not a rebuild per
// sport. The fetch function, storage shape, and freshness-check logic are
// IDENTICAL across every entry below — adding a new sport/period later
// should be a new block in this file only. If any future code needs an
// `if (sport === 'mlb')` branch to handle a new entry, the generality has
// broken and that's a bug in the code, not a limitation of this config.
//
// Period-type keys match the naming already established in
// researchRequirements.js's REQUIREMENTS/KNOWN_MARKETS ('f5', 'first_half')
// for MLB — this file is the odds-sourcing counterpart to that file's
// research-requirements counterpart. 'first_quarter' / 'first_period' /
// 'first_set' are new keys, reserved for the NBA/NCAAB, NHL, and tennis
// activations that come later per Fork 1 — present here as documented,
// inactive shape, not wired into the fetch yet (see ACTIVE below).
//
// Market keys are copied verbatim from The Odds API's own current docs
// (the-odds-api.com/sports-odds-data/betting-markets.html, "Game Period
// Markets" table, confirmed Sep 10, 2026). These live under the provider's
// "Additional Markets" tier and are fetched via the per-event endpoint
// (GET /v4/sports/{sport}/events/{eventId}/odds), NOT the bulk endpoint
// /api/odds/route.js already uses for h2h/spreads/totals — this is
// genuinely new, per-event API usage, not a parameter added to an
// existing call.

export const PERIOD_MARKETS = {
  baseball_mlb: {
    f5: {
      label: 'First 5 Innings',
      providerKeys: {
        moneyline: 'h2h_1st_5_innings',
        spread: 'spreads_1st_5_innings',
        total: 'totals_1st_5_innings',
      },
    },
  },
  americanfootball_nfl: {
    first_half: {
      label: 'First Half',
      providerKeys: {
        moneyline: 'h2h_h1',
        spread: 'spreads_h1',
        total: 'totals_h1',
      },
    },
  },
  americanfootball_ncaaf: {
    first_half: {
      label: 'First Half',
      providerKeys: {
        moneyline: 'h2h_h1',
        spread: 'spreads_h1',
        total: 'totals_h1',
      },
    },
  },

  // ── Reserved, not yet activated (see ACTIVE below) ───────────────────
  // Real provider keys, confirmed same source/date as above — wiring these
  // in later is a config-only change per Fork 1, exactly the scale test
  // this file exists to prove.
  basketball_nba: {
    first_half: { label: 'First Half', providerKeys: { moneyline: 'h2h_h1', spread: 'spreads_h1', total: 'totals_h1' } },
    first_quarter: { label: 'First Quarter', providerKeys: { moneyline: 'h2h_q1', spread: 'spreads_q1', total: 'totals_q1' } },
  },
  basketball_ncaab: {
    first_half: { label: 'First Half', providerKeys: { moneyline: 'h2h_h1', spread: 'spreads_h1', total: 'totals_h1' } },
  },
  icehockey_nhl: {
    first_period: { label: 'First Period', providerKeys: { moneyline: 'h2h_p1', spread: 'spreads_p1', total: 'totals_p1' } },
  },
  soccer_epl: {
    first_half: { label: 'First Half', providerKeys: { total: 'totals_h1' } }, // soccer 1H moneyline/spread not in provider's core table; total + btts_h1 are
  },
};

// Sports actually wired into the research-scheduler fetch + Stage 2 prompt
// + finalize-picks freshness/publish path in THIS build. Everything else in
// PERIOD_MARKETS above is real, documented, and inactive — flipping one on
// later should mean adding its sport_key here, nothing else, per Fork 1.
export const ACTIVE_PERIOD_SPORTS = ['baseball_mlb', 'americanfootball_nfl', 'americanfootball_ncaaf'];

// Returns the period-market definitions for a sport, or null if this sport
// has no active period markets. Single entry point so calling code never
// reaches into PERIOD_MARKETS directly / never branches on sport_key itself.
export function getActivePeriodMarketsForSport(sportKey) {
  if (!ACTIVE_PERIOD_SPORTS.includes(sportKey)) return null;
  return PERIOD_MARKETS[sportKey] || null;
}
