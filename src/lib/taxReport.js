// ============================================================
// TAX REPORT ENGINE — Gambling Activity Report generator
//
// Pure computation only. No DB or network calls in this file —
// the API route (src/app/api/tax-report/route.js) fetches rows
// and calls buildTaxReport() with them.
//
// SESSION-GROUPING METHODOLOGY (Miles's decision, Sep 2026 session):
// Sessions are grouped by (game_date, sportsbook). This is the
// closest analog to the only federal session-method framework that
// exists — IRS Notice 2015-21, a *proposed* (never finalized) safe
// harbor for electronically tracked SLOT MACHINE play, which bounds
// a session to a single calendar day at a single establishment.
//
// The IRS has NOT published sports-betting-specific session
// guidance. Some preparers read the more conservative position as
// "no netting — treat every wager as its own transaction," since a
// discrete sports bet (unlike continuous slot play) has an
// immediately knowable win/loss outcome. Because of that genuine
// ambiguity, this report always returns the full per-wager ledger
// alongside the grouped session totals, so a user (or their CPA)
// can apply either position. See SESSION_METHOD_NOTE below — it's
// meant to be shown on the report itself, not just live in code
// comments.
//
// Known limitation: `game_date` is used as a proxy for "date of the
// wagering." That's accurate for standard single-game wagers placed
// same-day (the vast majority of activity), but not for futures or
// long-term outcome bets placed well before the settling event.
// ============================================================

export const PREDICTION_MARKET_BOOKS = ['Kalshi', 'Polymarket'];
export const MANUAL_ADJUSTMENT_BET_TYPE = 'manual_adjustment';

// OBBBA (July 2025), effective tax year 2026: losses deductible up to
// 90% of losses (was 100%), still capped at total winnings, no
// carryforward of the disallowed 10%.
export const OBBBA_LOSS_CAP_PCT = 0.90;

export const UNSPECIFIED_SPORTSBOOK_LABEL = 'Unspecified';

export const PREDICTION_MARKET_EXCLUSION_NOTE =
  "Prediction market activity (Kalshi, Polymarket) is not included in the totals above. The IRS has not issued formal guidance on how these platforms' contracts should be classified for tax purposes, and this report's calculations follow the gambling-specific rules (Schedule 1 / Schedule A, the 90% loss-deduction cap) that may not apply to that activity. If you traded on these platforms, review that activity separately with your tax professional.";

export const SESSION_METHOD_NOTE =
  "This report groups your wagers into sessions by calendar day and sportsbook, netting wins and losses within each session before totaling. That's the approach most closely aligned with the only federal session-method framework the IRS has published \u2014 a proposed safe harbor for slot machine play (IRS Notice 2015-21) that was never finalized and does not address sports betting directly. The IRS has not issued sports-betting-specific session guidance, and some tax professionals take the more conservative position that each individual wager should be reported on its own. A full, ungrouped wager-by-wager ledger is included so you or your tax professional can apply whichever approach you choose.";

export const REPORT_DISCLAIMER =
  "This is an organizer to help you and your tax professional prepare your return \u2014 it is not tax advice, and Betcierge is not a tax advisor. Federal and state gambling-tax rules are complex and vary by jurisdiction; please review this report with a qualified tax professional before filing.";

/**
 * Computes profit for a winning wager. Prefers the already-recorded
 * payout amount; falls back to the same American-odds formula used
 * elsewhere in the app (see page.js bet-list rendering) when it's
 * missing. Returns { net, estimated, uncomputable }.
 */
export function computeWinProfit(stake, oddsStr, recordedToWin) {
  const recorded = parseFloat(recordedToWin);
  if (recordedToWin !== null && recordedToWin !== undefined && !isNaN(recorded)) {
    return { net: recorded, estimated: false, uncomputable: false };
  }
  const odds = parseFloat(oddsStr);
  if (isNaN(odds) || odds === 0) {
    // Missing payout AND unreadable odds (e.g. "Even" typed instead of
    // "+100", or a blank field) — can't compute. Net stays 0 and the
    // caller surfaces this as its own data-quality warning rather than
    // silently understating income.
    return { net: 0, estimated: true, uncomputable: true };
  }
  const net = odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds);
  return { net, estimated: true, uncomputable: false };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalizes one raw DB row (straight bet or parlay ticket) into a common wager shape. */
function normalizeWager(row, kind) {
  const isParlay = kind === 'parlay';
  const stake = parseFloat(isParlay ? row.wager : row.amount) || 0;
  const recordedToWin = isParlay ? (row.adjusted_to_win ?? row.to_win) : row.to_win;
  const oddsStr = isParlay ? (row.adjusted_odds ?? row.odds) : row.odds;
  const result = (row.result || '').trim();

  let net = 0;
  let profitEstimated = false;
  let profitUncomputable = false;

  if (result === 'Win') {
    const r = computeWinProfit(stake, oddsStr, recordedToWin);
    net = r.net;
    profitEstimated = r.estimated;
    profitUncomputable = r.uncomputable;
  } else if (result === 'Loss') {
    net = -stake;
  }
  // Push, Void, or anything else not Win/Loss nets to zero — not
  // wagering income and not a deductible loss.

  const sportsbook = row.sportsbook || null;

  return {
    id: row.id,
    kind,
    game: isParlay ? `Parlay (${row.num_legs ?? '?'} legs, ticket ${row.ticket_number || row.id})` : row.game,
    betType: row.bet_type,
    pick: isParlay ? null : row.pick,
    odds: oddsStr ?? null,
    stake: round2(stake),
    result,
    sportsbook,
    isPredictionMarket: sportsbook ? PREDICTION_MARKET_BOOKS.includes(sportsbook) : false,
    gameDate: row.game_date,
    net,
    profitEstimated,
    profitUncomputable,
  };
}

/**
 * Builds the full Gambling Activity Report from raw straight-bet and
 * parlay rows already scoped to one user and one tax year by the caller.
 *
 * @param {Object} params
 * @param {Array} params.straightBets - raw rows from `user_bets`
 * @param {Array} params.parlays - raw rows from `parlays`
 * @param {number} params.taxYear
 */
export function buildTaxReport({ straightBets = [], parlays = [], taxYear }) {
  const dataQualityWarnings = [];

  const excludedManualAdjustments = straightBets.filter(
    (b) => (b.bet_type || '').toLowerCase() === MANUAL_ADJUSTMENT_BET_TYPE
  ).length;
  if (excludedManualAdjustments > 0) {
    dataQualityWarnings.push(
      `${excludedManualAdjustments} manual P&L adjustment${excludedManualAdjustments === 1 ? '' : 's'} excluded \u2014 these aren't real wagers and have no session/date/sportsbook to report.`
    );
  }

  const rawWagers = [
    ...straightBets
      .filter((b) => (b.bet_type || '').toLowerCase() !== MANUAL_ADJUSTMENT_BET_TYPE)
      .map((b) => normalizeWager(b, 'straight')),
    ...parlays.map((p) => normalizeWager(p, 'parlay')),
  ];

  const uncomputableCount = rawWagers.filter((w) => w.profitUncomputable).length;
  if (uncomputableCount > 0) {
    dataQualityWarnings.push(
      `${uncomputableCount} winning wager${uncomputableCount === 1 ? '' : 's'} had no recorded payout AND unreadable odds \u2014 included at $0 profit. Review these manually; they likely understate your income.`
    );
  }
  const estimatedCount = rawWagers.filter((w) => w.profitEstimated && !w.profitUncomputable).length;
  if (estimatedCount > 0) {
    dataQualityWarnings.push(
      `${estimatedCount} winning wager${estimatedCount === 1 ? '' : 's'} had no recorded payout amount \u2014 profit was estimated from odds and stake.`
    );
  }

  const gamblingWagers = rawWagers.filter((w) => !w.isPredictionMarket);
  const predictionMarketWagers = rawWagers.filter((w) => w.isPredictionMarket);

  const unspecifiedCount = gamblingWagers.filter((w) => !w.sportsbook).length;
  if (unspecifiedCount > 0) {
    dataQualityWarnings.push(
      `${unspecifiedCount} wager${unspecifiedCount === 1 ? '' : 's'} had no sportsbook logged and ${unspecifiedCount === 1 ? 'was' : 'were'} grouped under "${UNSPECIFIED_SPORTSBOOK_LABEL}." Logging sportsbook on new bets will make future reports more precise.`
    );
  }

  // ── Session grouping: (game_date, sportsbook) ──────────────────────────
  const sessionMap = new Map();
  for (const w of gamblingWagers) {
    const bookLabel = w.sportsbook || UNSPECIFIED_SPORTSBOOK_LABEL;
    const key = `${w.gameDate}::${bookLabel}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, { date: w.gameDate, sportsbook: bookLabel, wagers: [], net: 0 });
    }
    const session = sessionMap.get(key);
    session.wagers.push(w);
    session.net += w.net;
  }

  const sessions = Array.from(sessionMap.values()).sort((a, b) =>
    a.date === b.date ? a.sportsbook.localeCompare(b.sportsbook) : (a.date || '').localeCompare(b.date || '')
  );

  const totalWinningSessionIncome = sessions.filter((s) => s.net > 0).reduce((sum, s) => sum + s.net, 0);
  const totalLosingSessionLoss = sessions.filter((s) => s.net < 0).reduce((sum, s) => sum + Math.abs(s.net), 0);

  // ── OBBBA 90% cap, still capped at total winnings ──────────────────────
  const deductibleLoss = Math.min(totalLosingSessionLoss * OBBBA_LOSS_CAP_PCT, totalWinningSessionIncome);
  const nonDeductibleLoss = totalLosingSessionLoss - deductibleLoss;

  return {
    taxYear,
    disclaimer: REPORT_DISCLAIMER,
    sessionMethodNote: SESSION_METHOD_NOTE,
    predictionMarketNote: predictionMarketWagers.length > 0 ? PREDICTION_MARKET_EXCLUSION_NOTE : null,
    dataQualityWarnings,
    summary: {
      // Fully taxable regardless of itemizing (Schedule 1, Line 8b):
      schedule1GrossWinnings: round2(totalWinningSessionIncome),
      // Pre-cap total of all losing-session losses, for reference:
      totalSessionLosses: round2(totalLosingSessionLoss),
      // Only deductible if itemizing (Schedule A), and only up to this amount:
      scheduleADeductibleLossIfItemizing: round2(deductibleLoss),
      // Real economic loss with no tax benefit \u2014 the OBBBA "phantom income" effect:
      nonDeductibleLoss: round2(nonDeductibleLoss),
      // What you'd owe tax on if itemizing and claiming the full allowed deduction:
      netIfItemizing: round2(totalWinningSessionIncome - deductibleLoss),
      itemizingRequiredNote:
        'Losses are only deductible if you itemize (Schedule A). If you take the standard deduction, the full Schedule 1 winnings above are still taxable with no offset.',
    },
    sessions: sessions.map((s) => ({
      date: s.date,
      sportsbook: s.sportsbook,
      net: round2(s.net),
      wagerCount: s.wagers.length,
    })),
    ledger: rawWagers
      .slice()
      .sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''))
      .map((w) => ({
        date: w.gameDate,
        sportsbook: w.sportsbook || (w.isPredictionMarket ? w.sportsbook : UNSPECIFIED_SPORTSBOOK_LABEL),
        game: w.game,
        betType: w.betType,
        pick: w.pick,
        odds: w.odds,
        stake: w.stake,
        result: w.result,
        net: round2(w.net),
        profitEstimated: w.profitEstimated,
        excludedAsPredictionMarket: w.isPredictionMarket,
      })),
  };
}
