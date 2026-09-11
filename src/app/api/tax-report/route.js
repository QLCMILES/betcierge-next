import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildTaxReport } from '../../../lib/taxReport';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST { userId, taxYear } -> full Gambling Activity Report JSON.
//
// Scope: settled straight bets (user_bets) + settled parlay tickets
// (parlays), for one user, where game_date falls in the given calendar
// year. Manual P&L adjustments (bet_type = 'manual_adjustment') are
// excluded inside buildTaxReport() since they aren't real wagers.
//
// This route returns structured JSON only — PDF/CSV rendering and the
// report's home in the app UI are separate, not-yet-built steps (see
// SESSION_HANDOFF_TAX_REPORTING_2026-09-10.md).
export async function POST(req) {
  try {
    const { userId, taxYear } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    const year = parseInt(taxYear, 10);
    if (!year || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Missing or invalid taxYear' }, { status: 400 });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const SETTLED_RESULTS = ['Win', 'Loss', 'Push', 'Void'];

    const [straightRes, parlayRes] = await Promise.all([
      supabase
        .from('user_bets')
        .select('id, game, bet_type, pick, odds, amount, to_win, result, game_date, sportsbook')
        .eq('user_id', userId)
        .in('result', SETTLED_RESULTS)
        .gte('game_date', startDate)
        .lte('game_date', endDate),
      supabase
        .from('parlays')
        .select(
          'id, ticket_number, bet_type, wager, to_win, odds, adjusted_odds, adjusted_to_win, num_legs, result, game_date, sportsbook'
        )
        .eq('user_id', String(userId))
        .in('result', SETTLED_RESULTS)
        .gte('game_date', startDate)
        .lte('game_date', endDate),
    ]);

    if (straightRes.error || parlayRes.error) {
      console.error('Tax report query error:', straightRes.error || parlayRes.error);
      return NextResponse.json({ error: 'Failed to load bet history' }, { status: 500 });
    }

    const report = buildTaxReport({
      straightBets: straightRes.data || [],
      parlays: parlayRes.data || [],
      taxYear: year,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Tax report generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
