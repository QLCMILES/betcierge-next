import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side route using the service-role key. Exists because the Aug 5
// RLS lockdown correctly blocks a direct client-side read of
// game_candidates — RLS doesn't throw, it silently returns 0 matching
// rows to any role without a policy, so the old direct-from-browser query
// "succeeded" with a valid-looking but wrong 0.
//
// Counts today's game_candidates rows, EXCLUDING rows still sitting at
// research_status = 'pending_evaluation' — this is a deliberate design
// choice so the number reflects "genuinely evaluated" rather than
// "queued but not yet looked at," which keeps the stat honest early in
// the day rather than just mirroring the old (broken) query's logic.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const { count, error } = await supabase
      .from('game_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('date', today)
      .neq('research_status', 'pending_evaluation');

    if (error) {
      console.error('opportunities-count error:', error);
      return NextResponse.json({ count: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    console.error('opportunities-count exception:', e);
    return NextResponse.json({ count: null, error: String(e) }, { status: 500 });
  }
}
