// ── Period Odds Fetch ────────────────────────────────────────────────────
// Sep 10, 2026 period-markets build. Fetches REAL period-market odds for
// ONE specific event from The Odds API's per-event endpoint. This is
// genuinely separate, per-event API usage — NOT part of the bulk
// /api/odds call every other odds lookup in this app uses (h2h/spreads/
// totals only), because period markets (F5, first half, etc.) live under
// the provider's "Additional Markets" tier and are only exposed one event
// at a time via GET /v4/sports/{sport}/events/{eventId}/odds.
//
// Fork 2 (unanimous, all three reviewers): called exactly once, when a
// candidate clears Stage 1 — see the call site in research-scheduler.js's
// submitNewResearch(). Never called speculatively, never called because
// the model "wants" a period bet — the model only ever reasons about
// period lines it's already been handed.
//
// Fork 3 (unanimous): returns the structured shape below, one key per
// active period type for this sport, each carrying its own captured_at/
// source provenance (ChatGPT + Gemini, both explicit on this) so a
// published period pick's exact number can always be traced back to
// where and when it was captured.

import { getActivePeriodMarketsForSport } from './periodMarketsConfig';

// Pinned to the SAME book as research-scheduler.js's full-game snapshots
// (PRIMARY_BOOKMAKER_KEY there) so a period snapshot and a full-game
// snapshot for the same candidate are never silently comparing two
// different sportsbooks' numbers — the exact bug class the Aug 27 fix
// (see research-scheduler.js) already closed for full-game odds.
const PRIMARY_BOOKMAKER_KEY = 'draftkings';

// sportKey: The Odds API sport key (e.g. 'baseball_mlb'), matching
// candidate.sport_key elsewhere in this codebase.
// eventId: The Odds API's own event id — the SAME id already used as
// gameId throughout Snap-to-Log's grounding engine, obtained from the
// bulk /api/odds response's `.id` field for the matching game.
//
// Returns null — honestly, not as an error — when: this sport has no
// active period markets configured (cheap short-circuit, no API call
// spent), no eventId is available, the provider request fails, or the
// provider simply has no period-market data posted for this event yet.
// Matches the PAST_GAME_SOURCES "degrade honestly" pattern already
// established elsewhere in this codebase (see page.js) rather than
// throwing or fabricating a fallback value.
export async function fetchPeriodOddsForEvent(sportKey, eventId, apiKey) {
  const periods = getActivePeriodMarketsForSport(sportKey);
  if (!periods || !eventId || !apiKey) return null;

  const allProviderKeys = Object.values(periods)
    .flatMap(def => Object.values(def.providerKeys))
    .join(',');

  let data;
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${allProviderKeys}&oddsFormat=american`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null; // provider has nothing for this event/market combo (yet) — honest null, not an error
    data = await res.json();
  } catch (e) {
    return null;
  }

  const bm = data.bookmakers?.find(b => b.key === PRIMARY_BOOKMAKER_KEY) || data.bookmakers?.[0];
  if (!bm) return null;

  const capturedAt = new Date().toISOString();
  const result = {};

  for (const [periodType, def] of Object.entries(periods)) {
    const periodResult = {};

    const mlKey = def.providerKeys.moneyline;
    const mlMarket = mlKey && bm.markets?.find(m => m.key === mlKey);
    if (mlMarket) {
      const home = mlMarket.outcomes?.find(o => o.name === data.home_team);
      const away = mlMarket.outcomes?.find(o => o.name === data.away_team);
      if (home && away) periodResult.moneyline = { home: home.price, away: away.price };
    }

    const spKey = def.providerKeys.spread;
    const spMarket = spKey && bm.markets?.find(m => m.key === spKey);
    if (spMarket) {
      const home = spMarket.outcomes?.find(o => o.name === data.home_team);
      const away = spMarket.outcomes?.find(o => o.name === data.away_team);
      if (home && away) {
        periodResult.spread = {
          home_line: home.point, home_price: home.price,
          away_line: away.point, away_price: away.price,
        };
      }
    }

    const totKey = def.providerKeys.total;
    const totMarket = totKey && bm.markets?.find(m => m.key === totKey);
    if (totMarket) {
      const over = totMarket.outcomes?.find(o => o.name === 'Over');
      const under = totMarket.outcomes?.find(o => o.name === 'Under');
      if (over && under) {
        periodResult.total = {
          over_line: over.point, over_price: over.price,
          under_line: under.point, under_price: under.price,
        };
      }
    }

    if (Object.keys(periodResult).length > 0) {
      periodResult.captured_at = capturedAt;
      periodResult.source = bm.key;
      result[periodType] = periodResult;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// Formats a captured period-odds object into short, human/model-readable
// lines for direct injection into the Stage 2 prompt — same spirit as the
// moneyline/spread/total string formatting fetchLiveOddsForGame already
// does for full-game odds in research-scheduler.js, just for period markets.
// e.g. "F5: NYY ML -190 / COL ML +160 | NYY -0.5 -115 / COL +0.5 -105 | O/U 4.5 -110/-110"
export function formatPeriodOddsForPrompt(periodOdds, homeTeam, awayTeam) {
  if (!periodOdds) return null;
  const lines = [];
  for (const [periodType, data] of Object.entries(periodOdds)) {
    const parts = [];
    if (data.moneyline) {
      parts.push(`ML: ${homeTeam} ${data.moneyline.home > 0 ? '+' : ''}${data.moneyline.home} / ${awayTeam} ${data.moneyline.away > 0 ? '+' : ''}${data.moneyline.away}`);
    }
    if (data.spread) {
      parts.push(`Spread: ${homeTeam} ${data.spread.home_line > 0 ? '+' : ''}${data.spread.home_line} (${data.spread.home_price}) / ${awayTeam} ${data.spread.away_line > 0 ? '+' : ''}${data.spread.away_line} (${data.spread.away_price})`);
    }
    if (data.total) {
      parts.push(`Total: O ${data.total.over_line} (${data.total.over_price}) / U ${data.total.under_line} (${data.total.under_price})`);
    }
    if (parts.length > 0) {
      lines.push(`${periodType.toUpperCase()} — ${parts.join(' | ')}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
