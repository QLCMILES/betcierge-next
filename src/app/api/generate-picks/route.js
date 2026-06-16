import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generatePicks() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Prevent duplicates
  const { data: existingPicks } = await supabase
    .from('daily_picks')
    .select('id')
    .eq('date', today)
    .eq('status', 'active')
    .limit(1);

  if (existingPicks && existingPicks.length > 0) {
    console.log('Picks already generated for today, skipping');
    return;
  }

  // Mark any old picks for today inactive
  await supabase
    .from('daily_picks')
    .update({ status: 'inactive' })
    .eq('date', today);

  // Fetch odds
  const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds', { method: 'POST' });
  const oddsData = await oddsRes.json();

  const now = new Date();
  const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
  const upperBound = new Date(now.getTime() + 14 * 60 * 60 * 1000);

  const slimGames = (oddsData.games || [])
    .filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound)
    .slice(0, 12)
    .map(g => {
      const bm = g.bookmakers?.[0];
      const h2h = bm?.markets?.find(m => m.key === 'h2h');
      const spread = bm?.markets?.find(m => m.key === 'spreads');
      const total = bm?.markets?.find(m => m.key === 'totals');
      return {
        sport: g.sport_title,
        game: `${g.away_team} @ ${g.home_team}`,
        time: g.commence_time,
        moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', '),
        spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
        total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
      };
    });

  const gamesContext = JSON.stringify(slimGames);
  const today_display = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are Hunter, an elite sports betting analyst and professional handicapper. Today is ${today_display}.

You have web search — use it aggressively. Search for EACH pick before writing about it.

UNIVERSAL RULES FOR ALL SPORTS:
- Always search line movement: "[team] vs [team] line movement today" — if line moved 2+ points against your pick, that is sharp money on the other side. Flag it.
- Always search ATS records: "[team] ATS record [year]" and "[team] ATS record as [favorite/underdog] [year]"
- KEY NUMBER AWARENESS (NFL/NCAAF): The most important numbers are -3, -7, -10, -14. Never lay -3.5 when -3 was available. Never take +2.5 when you could get +3. Always note if a line is sitting on or off a key number and whether it has moved through one.
- Always verify injury status before recommending any bet involving a key player.
- Never recommend a game not in tonight's odds feed. Never invent lines from memory.

MLB SEARCH CHECKLIST (run all before recommending):
- "[pitcher] ERA xERA xFIP WHIP last 5 starts [year]"
- "[pitcher] vs [team] career stats strikeout rate"
- "[team] bullpen ERA usage last 7 days [year]"
- "[team] vs [LHP/RHP] batting splits wRC+ OPS [year]"
- "[team] vs [team] line movement today"
- "[team] ATS record [year]"
- "weather [city] tonight wind speed direction"
- "umpire [name] strikeout rate walk rate [year]"
- "[stadium] park factor runs HR [year]"

NFL/NCAAF SEARCH CHECKLIST (run all before recommending):
- "[team] vs [team] line movement today" — opening line vs current, which way sharp money moved
- "[team] ATS record [year]" and "[team] ATS record as [home/road] [favorite/underdog] [year]"
- "[team] injury report [date]" — specifically QB, WR1, LT, key defenders
- "[QB] completion % yards per attempt last 3 games [year]"
- "[team] O-line PFF grade vs [team] D-line PFF grade [year]"
- "[team] vs [team] DVOA offensive defensive [year]"
- "[team] pace plays per game vs [team] pace [year]"
- "[team] red zone TD% vs [team] red zone defense [year]"
- "[team] third down conversion rate vs [team] third down defense [year]"
- "weather [stadium city] wind speed direction temperature [date]" — wind 15mph+ kills passing games and totals
- "[team] ATS record divisional games [year]" if divisional matchup
- "[team] home/road ATS record [year]"
- "[team] last 3 games ATS result scoring margin [year]"
- "sharp money [team] vs [team] [date]" — look for reverse line movement signals

NBA SEARCH CHECKLIST (run all before recommending):
- "[player] playing tonight [date]" — mandatory for any prop or team bet
- "[team] back to back schedule [date]"
- "[team] offensive rating defensive rating pace last 10 games [year]"
- "[team] vs [team] line movement today"
- "[team] ATS record [year]"
- "referee assignment [team] vs [team] [date]" — high foul refs inflate totals

NHL SEARCH CHECKLIST (run all before recommending):
- "[team] starting goalie tonight [date]" — NEVER recommend without confirmed starter
- "[team] vs [team] line movement today"
- "[team] power play % penalty kill % last 10 games [year]"
- "[team] ATS record puck line [year]"

SOCCER SEARCH CHECKLIST (run all before recommending):
- "[team] xG xGA last 5 matches [year]"
- "[team] form last 5 home/away [year]"
- "[team] vs [team] line movement today"
- "[team] injury and rotation risk [date]"
- "PPDA press intensity [team] [year]"

UFC SEARCH CHECKLIST (run all before recommending):
- "[fighter] replacement or injury [event]" — late replacement is a major fade signal
- "[fighter] weigh-in result [event]"
- "judge assignment [event] [date]" — judges dramatically affect method of victory
- "[fighter] finish rate vs decision rate [year]"

WRITE EACH INSIGHT LIKE A PROFESSIONAL HANDICAPPER:
- Use bold section headers
- Cite specific numbers and stats
- Name the key players, pitchers, quarterbacks
- Show the mismatch clearly
- Always note where sharp money is pointing
- Always note if you are on or off a key number (NFL/NCAAF)
- Minimum 150 words per insight
- Never be vague — every claim needs a real stat behind it
- This is what bettors are paying for — make the case compellingly`,
      messages: [{
        role: 'user',
        content: `Today is ${today_display}. Available games with current lines: ${gamesContext}

Search the web for today's matchup data, then select the 3 best pre-game plays. Return ONLY raw JSON, no markdown:
{"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","units":2,"game_time":"H:MM PM ET","insight":"DETAILED multi-paragraph breakdown with bold headers, specific stats, pitcher names, line movement, and sharp money context. Minimum 150 words."}]}

UNIT SIZING RULES: Set units based on your conviction level. High confidence = 2 units. Medium confidence = 1 unit. Low confidence = 0.5 units. Never recommend more than 2 units on any single play.`
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');

  const clean = text.replace(/```json|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.picks) throw new Error('Invalid format');

  const rows = parsed.picks.map(p => ({
    date: today,
    sport: p.sport,
    game: p.game,
    pick: p.pick,
    odds: p.odds,
    confidence: p.confidence,
    insight: p.insight,
    units: p.confidence === 'High' ? 2 : p.confidence === 'Low' ? 0.5 : parseFloat(p.units) || 1,
    game_time: p.game_time || null,
    status: 'active',
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('daily_picks')
    .insert(rows);

  if (error) throw error;
  console.log(`Successfully generated ${rows.length} picks for ${today}`);
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const cronSecret = request.headers.get('x-cron-secret');

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return 200 immediately so cron-job.org doesn't time out
  // Vercel continues running generatePicks() in the background
  waitUntil(generatePicks().catch(err => console.error('generatePicks error:', err)));

  return Response.json({ success: true, message: 'Pick generation started' });
}

export async function POST(request) {
  return GET(request);
}
