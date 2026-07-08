import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_SEARCHES_REQUIRED = 15;
const TIME_BUDGET_MS = 220000; // leave ~80s buffer under the 300s function limit — continuation calls alone can take 60-90+ seconds

async function callClaude(body) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

function countSearches(content) {
  return (content || []).filter(c => c.type === 'server_tool_use' && c.name === 'web_search').length;
}

function extractText(content) {
  return (content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

function cleanJson(text) {
  const clean = text
    .replace(/```json|```/g, '')
    .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '')
    .trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0, 300));
  return JSON.parse(jsonMatch[0]);
}

// ── Spread/Run-line Sign Correction ──────────────────────────────────────
// The model sometimes drops or gets wrong the +/- sign on spread and run
// line picks (e.g. "Atlanta Braves 1.5" instead of "Atlanta Braves -1.5").
// Rather than trust generated text for this, we rebuild the number directly
// from the real odds feed every time — the sign is never generated, only
// substituted from ground truth after the fact.
function normalizeSpreadSign(pick, spreadLookup) {
  const pickText = pick.pick || '';

  // Skip picks that clearly aren't full-game spread/run-line bets.
  const isTotal = /\b(over|under)\b/i.test(pickText);
  const isAltLine = /\bf5\b|first\s*5|1h\b|first\s*half/i.test(pickText);
  const isMoneyline = /\bml\b/i.test(pickText) || (!/[\d]\.\d/.test(pickText) && !/[+-]\s*\d+(\.\d+)?\s*$/.test(pickText));
  if (isTotal || isAltLine) return pick;

  const teamPoints = spreadLookup[pick.game];
  if (!teamPoints) {
    // Game not found in the lookup (shouldn't happen since games must come
    // from the feed) — leave the pick untouched but flag it for visibility.
    if (!isMoneyline) {
      console.log(`SPREAD_SIGN_UNVERIFIED: no spread data found for game "${pick.game}", pick left as-is: "${pickText}"`);
    }
    return pick;
  }

  // Find which team this pick actually refers to.
  const matchedTeam = Object.keys(teamPoints).find(teamName =>
    pickText.toLowerCase().includes(teamName.toLowerCase())
  );
  if (!matchedTeam) {
    if (!isMoneyline) {
      console.log(`SPREAD_SIGN_UNVERIFIED: no matching team found in pick "${pickText}" for game "${pick.game}"`);
    }
    return pick;
  }

  const truePoint = teamPoints[matchedTeam];
  if (truePoint === undefined || truePoint === null) return pick;

  // If this pick has no decimal spread number at all, it's a moneyline on
  // this team, not a spread pick — leave it alone.
  if (!/\d+\.\d/.test(pickText)) return pick;

  const signedPoint = truePoint > 0 ? `+${truePoint}` : `${truePoint}`;
  const rebuiltPick = `${matchedTeam} ${signedPoint}`;

  if (rebuiltPick !== pickText) {
    console.log(`SPREAD_SIGN_CORRECTED: "${pickText}" -> "${rebuiltPick}" (ground truth from odds feed)`);
  }

  return { ...pick, pick: rebuiltPick };
}

// ── Recent Picks Memory ─────────────────────────────────────────────────
// Pulls the last 7 days of picks and flags repeat teams so Hunter can't
// lean on the same "good team" call day after day without new information.
async function buildRecentPicksMemory() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { data: recentPicks } = await supabase
    .from('daily_picks')
    .select('date, sport, game, pick, result')
    .gte('date', cutoffDate)
    .order('date', { ascending: false });

  if (!recentPicks || recentPicks.length === 0) {
    return 'No picks in the last 7 days — no repetition data available yet.';
  }

  const teamCounts = {};
  const teamPickLog = {};
  for (const p of recentPicks) {
    if (!p.game || !p.pick) continue;
    const teams = p.game.split(/ @ | vs /i).map(t => t.trim()).filter(Boolean);
    for (const team of teams) {
      const lastWord = team.split(' ').pop();
      if (lastWord && lastWord.length > 3 && p.pick.toLowerCase().includes(lastWord.toLowerCase())) {
        teamCounts[team] = (teamCounts[team] || 0) + 1;
        teamPickLog[team] = teamPickLog[team] || [];
        teamPickLog[team].push(`${p.date}: "${p.pick}" (result: ${p.result})`);
      }
    }
  }

  const repeatedTeams = Object.entries(teamCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  let summary = `RECENT PICKS — LAST 7 DAYS (${recentPicks.length} total picks):\n`;
  summary += recentPicks.map(p => `- ${p.date}: [${p.sport}] ${p.game} — "${p.pick}" (${p.result})`).join('\n');

  if (repeatedTeams.length > 0) {
    summary += `\n\n⚠️ REPEAT WARNING — teams picked 2+ times in the last 7 days:\n`;
    for (const [team, count] of repeatedTeams) {
      summary += `- ${team}: picked ${count}x — ${teamPickLog[team].join('; ')}\n`;
    }
    summary += `\nDo NOT pick any of these teams again today unless you can name something CONCRETELY NEW since your last pick on that team — a different starting pitcher, a new injury, a materially different line, or a different opponent with a real mismatch. "They're just a good team" or "I like fading them" is NOT sufficient justification for a repeat. If you do pick a repeated team, your insight MUST open by stating exactly what is different this time.`;
  }

  return summary;
}

// ── Stage 1: Candidate Pool ─────────────────────────────────────────────
// Lightweight pass — identify 8-10 candidates across bet types with brief
// reasoning, before spending the research budget. No deep research yet.
async function buildCandidatePool(gamesContext, today_display, recentPicksMemory, sportsAvailable) {
  const multiSportNote = sportsAvailable.length > 1
    ? `\n\nMULTIPLE SPORTS ARE LIVE TODAY: ${sportsAvailable.join(', ')}. Your candidate pool MUST include games from at least 2 different sports if games from 2+ sports are available in the feed. Do not let one sport dominate the pool just because it has more games listed.`
    : '';

  const system = `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

This is STAGE 1 of a two-stage process. Your ONLY job right now is to identify a diverse CANDIDATE POOL. Do NOT do deep research yet. Do NOT write insights yet. Just identify strong candidates worth researching further.

REQUIREMENTS FOR THE CANDIDATE POOL:
- Identify 8-10 candidates from the games feed below.
- Candidates MUST span multiple bet types: moneyline, run line/spread, totals, AND at least one alternate market when available (first 5 innings for MLB, first half, player props). Do NOT return a pool that is all moneyline or all spread.
- Do NOT propose a candidate on a team flagged in the repeat warning below unless you note specifically what is different this time.
- Each candidate needs only a ONE-SENTENCE reason — save the deep research for stage 2.
- Every game must come EXACTLY from the feed below. Never invent games.${multiSportNote}

IMPORTANT — what this diversity requirement is actually for: this pool is material to RESEARCH, not a preview of your final picks. You are being asked to make sure F5, props, and totals get genuinely looked at before you commit to anything, not to guarantee a mix of bet types in your final 3. If a real F5 or prop edge doesn't exist in today's slate, that's fine — the requirement is that you checked, not that you force one in.

${recentPicksMemory}

Return ONLY this JSON, no other text:
{"candidates":[{"sport":"...","game":"EXACT game name from feed","bet_type":"moneyline|spread|total|f5|first_half|prop","proposed_pick":"...","reason":"one sentence"}]}`;

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system,
    messages: [{
      role: 'user',
      content: `Today is ${today_display}. Available games with current lines:\n${gamesContext}\n\nReturn the candidate pool JSON now.`
    }],
  });

  const text = extractText(response.content);
  if (!text.trim()) throw new Error('Stage 1 returned no text');
  return cleanJson(text);
}

// Validate the candidate pool programmatically — don't trust self-grading.
function validateCandidatePool(pool) {
  const problems = [];
  const candidates = pool.candidates || [];

  if (candidates.length < 5) {
    problems.push(`Only ${candidates.length} candidates returned — need at least 5-8 for a real selection.`);
  }

  const betTypes = new Set(candidates.map(c => c.bet_type));
  if (betTypes.size <= 1) {
    problems.push(`All candidates are the same bet type (${[...betTypes].join(', ')}). Need diversity across moneyline/spread/total/F5/prop.`);
  }
  if (!candidates.some(c => ['f5', 'first_half', 'prop'].includes(c.bet_type))) {
    problems.push(`No alternate-market candidate (F5, first half, or prop) included. At least one is required when the sport supports it.`);
  }

  return problems;
}

// ── Stage 2: Deep Research + Final Picks ────────────────────────────────
async function runDeepResearch(gamesContext, today_display, candidatePool, recentPicksMemory) {
  const candidateList = (candidatePool.candidates || [])
    .map(c => `- [${c.sport}] ${c.game} — ${c.bet_type}: ${c.proposed_pick} (${c.reason})`)
    .join('\n');

  const system = `You are Hunter, an elite sports betting analyst and professional handicapper. Today is ${today_display}.

You have web search — use it AGGRESSIVELY. This is a PAID service. People are counting on your research. NEVER be lazy. NEVER rely on season-long stats when recent form tells a different story. Recent form ALWAYS beats season averages.

═══════════════════════════════════════
YOUR CANDIDATE POOL IS ALREADY SET (from Stage 1) — RESEARCH THESE
═══════════════════════════════════════
${candidateList}

Research ONLY these candidates. Only deviate if a candidate is clearly invalidated (pitcher scratched, player ruled out, line moved dramatically) — if so, explain the invalidation and substitute the next best option of the SAME bet type from the feed, do not just default back to a moneyline favorite.

${recentPicksMemory}

═══════════════════════════════════════
MANDATORY RESEARCH DEPTH
═══════════════════════════════════════
Run a MINIMUM of 3 web searches per candidate — more for MLB given the research checklist below. You must run at least ${MIN_SEARCHES_REQUIRED} total web searches across all candidates before finalizing. This is a hard minimum, not a suggestion. If you finish research early, go back and check something you haven't verified yet — bullpen usage, weather, umpire tendencies, line movement, opposing offense recent form — rather than stopping short.

STEP 1 — FULL RESEARCH ON EVERY CANDIDATE
Run ALL mandatory sport-specific searches below for each candidate.

STEP 2 — SCORE EACH CANDIDATE 1-10
Score based on: recent form edge, matchup quality, line value, injury risk, sharp money direction.

STEP 3 — SELECT TOP 3 BY SCORE
The 3 highest-scored candidates are today's picks. Not your first instinct. Not the obvious favorites. The top 3 by research score.

CRITICAL: Selection is based ENTIRELY on research score and edge quality — nothing else. If your 3 highest-scored candidates all happen to be the same bet type, that IS the correct output. Never downgrade a stronger pick or upgrade a weaker one just to create variety in your final 3. The diversity work already happened in the candidate pool; your only job now is finding the best value, full stop.

STEP 4 — SELF-VALIDATION (MANDATORY before finalizing)
Ask yourself:
- Is there a higher-confidence play I'm leaving out?
- Did I research BOTH sides — not just the pitcher/starter but the OPPOSING OFFENSE and their recent form?
- Did I check the opposing team's last 10-15 games? Are they historically hot right now?
- Did I check recent form (last 3 starts / last 10 games) not just season stats?
- Am I picking a team despite evidence pointing the other way?
- Did I verify lineup splits vs pitcher handedness?
- Did I check if the opposing offense is elite, average, or struggling RIGHT NOW?
- Does my insight SUPPORT my pick or argue against it? If my writeup says the starter is struggling but I'm picking that team anyway, I MUST clearly explain why the lineup/bullpen/opponent justifies it DESPITE the starter concerns. Never write an insight that reads as a case against your own pick.
- Am I recommending a moneyline at -200 or worse? If yes, STOP. At -200 the implied probability is 67% — the edge required to profit is too thin. Recommend the run line instead, or skip this game and find a better play elsewhere.
If any answer reveals a problem, replace the weakest pick.

═══════════════════════════════════════
CRITICAL DATA INTEGRITY RULES — ALWAYS ENFORCE
═══════════════════════════════════════
1. PITCHER TEAM VERIFICATION: The games feed includes away_starter and home_starter fields showing EXACTLY which pitcher starts for which team tonight. These are ground truth — NEVER contradict them with web search. The away_starter pitcher pitches for the AWAY team. The home_starter pitcher pitches for the HOME team. This is non-negotiable.
2. PITCHER REST CHECK: Search "[pitcher] last start date 2026". If they started within 3 days, they cannot start tonight.
3. GAME DATE CHECK: Every game you recommend must be from TODAY's odds feed. Never recommend a game not in tonight's feed.
4. INJURY VERIFICATION: Always search "[player] injury status today" before any bet involving a key player. If a star is out, re-evaluate the entire play.
5. LINE MOVEMENT CHECK: Always search "[team] vs [team] line movement today". If line moved 2+ points against your pick, that is sharp money on the other side. Flag it.
6. NEVER USE MEMORY FOR ROSTERS: Players get traded, cut, injured constantly. Always verify via web search.
7. CONFIRM GAME IS TONIGHT: If a game is not in the odds feed context, do not recommend it. Period.
8. STATS MUST MATCH THE GAME: Every stat, record, or trend cited in an insight MUST be about one of the two teams IN THAT SPECIFIC PICK. Never reference a third team's stats in a pick. If you searched for Dodgers vs Twins and a search result mentions the Royals, IGNORE the Royals data entirely — it is not relevant. Before including any stat, ask: "Is this team playing in this game?" If not, delete it.
9. RUN LINE / SPREAD DIRECTION: Before finalizing any spread or run line pick, do a mandatory self-check: read your own insight and ask "does my analysis argue this team wins by multiple runs/goals/points, or just stays close?" If your insight argues the team WINS OUTRIGHT or by a large margin, the pick MUST be [Team] -1.5 (or the negative spread). If your insight argues the team just stays within a run or covers as an underdog, the pick MUST be [Team] +1.5 (or the positive spread). NEVER recommend a negative spread pick with a positive spread line, and NEVER recommend a positive spread pick when your analysis says the team wins outright. Double-check the sign on every spread pick before returning the JSON.
10. NFL INJURY REPORT: Always search official practice designations before any NFL recommendation. Wind 15mph+ at outdoor stadium changes every passing prop — mandatory check.
11. NBA LOAD MANAGEMENT: Always search "[player] playing tonight [date]". Second night of back-to-back is mandatory search.
12. NHL GOALIE RULE: NEVER recommend any NHL bet without confirmed starting goalie. Search every time.
13. UFC LATE REPLACEMENT: Always search "[fighter] replacement [event]" and weigh-in result. Late replacement < 2 weeks = major fade signal.
14. JUICE THRESHOLD: NEVER recommend a moneyline at -200 or worse. The implied probability at -200 is 67% — you need to be right 2 out of 3 times just to break even. This is not value betting. If the best play is a heavy favorite ML, take the run line instead or skip the game entirely.
15. INSIGHT MUST MATCH PICK: Before finalizing, re-read your insight and ask: "If someone read only my insight and not my pick, would they bet the same side?" If not, rewrite the insight or change the pick. They must always agree.

═══════════════════════════════════════
UNIVERSAL RULES FOR ALL SPORTS
═══════════════════════════════════════
- Always search line movement: "[team] vs [team] line movement today" — if line moved 2+ points against your pick, that is sharp money on the other side. Flag it and explain it.
- Always search ATS records: "[team] ATS record [year]" and "[team] ATS record as [favorite/underdog] [year]"
- Always search "sharp money [team] vs [team] [date]" — look for reverse line movement signals
- KEY NUMBER AWARENESS (NFL/NCAAF): The most important numbers are -3, -7, -10, -14. Never lay -3.5 when -3 was available. Never take +2.5 when you could get +3. Always note if a line is sitting on or off a key number and whether it has moved through one.
- Always verify injury status before recommending any bet involving a key player.
- Never recommend a game not in tonight's odds feed. Never invent lines from memory.
- Closing line value: beating the closing number = positive CLV regardless of outcome.
- Reverse line movement: public heavy one side but line moves other way = sharp money signal.

═══════════════════════════════════════
MLB MANDATORY RESEARCH
═══════════════════════════════════════

STARTING PITCHER — YOUR TEAM:
- "[pitcher] last 3 starts ERA hits runs allowed [year]" — RECENT FORM, not season ERA
- "[pitcher] ERA xERA xFIP WHIP last 5 starts [year]"
- "[pitcher] vs [opposing team] career stats strikeout rate"
- "[pitcher] pitch count last 2 starts" — fatigue factor
- "[pitcher] first inning ERA [year]"
- "[pitcher] velocity type vs opposing lineup handedness"
- "[pitcher] home vs away splits [year]"
- Is starter CONFIRMED? Search "[team] starting pitcher today [date]"
- If F5 consideration: "[pitcher] average innings pitched last 5 starts"

STARTING PITCHER — OPPOSING:
- "[opposing pitcher] last 3 starts ERA hits runs [year]" — RECENT FORM
- "[opposing pitcher] xERA xFIP WHIP [year]"
- "[opposing pitcher] trend — improving or declining last 3 starts?"
- "[opposing pitcher] career stats vs [your team]"

OPPOSING OFFENSE — MANDATORY, NEVER SKIP:
- "[opposing team] record last 10 games [year]" — hot or cold RIGHT NOW?
- "[opposing team] run differential last 10 games [year]"
- "[opposing team] wRC+ OPS vs [LHP/RHP] [year]" — splits vs your pitcher's handedness
- "[opposing team] lineup vs [pitcher name] career stats" — batter by batter, not team K%
- "[opposing team] runs scored last 14 days [year]"
- "[opposing team] division standing and overall record [year]" — are they elite or struggling?
- "[opposing team] hot streak or cold streak [year]" — is this team on fire right now?
- "[opposing team] key injuries lineup [date]"

YOUR TEAM'S OFFENSE:
- "[your team] record last 10 games [year]"
- "[your team] runs scored last 7 days [year]"
- "[your team] vs [LHP/RHP] batting splits wRC+ OPS [year]"
- Platoon matchup %: L vs L, R vs R — does your lineup match up well?
- Catcher framing stats if relevant

BULLPEN — BOTH SIDES:
- "[team] bullpen ERA usage last 7 days [year]"
- "[team] bullpen usage innings pitched last 3 days [year]" — who is unavailable?
- "[closer name] availability [date]"

SITUATIONAL & ENVIRONMENTAL:
- "[team] vs [team] line movement today"
- "[team] ATS record [year]"
- "weather [city] tonight wind speed direction temperature" — wind 15mph+ kills totals
- "umpire [name] today [date] strikeout rate walk rate [year]"
- "[stadium] park factor runs HR [year]"
- Park factors by handedness
- Day vs night splits
- Pitcher pitch count history last 2 starts

PROP BET ANALYSIS — 7-STEP PROCESS:
1. Search "[player] vs [opponent] career stats head to head"
2. Search "[player] last 5 starts/games stats [year]"
3. Search "[player] vs [LHP/RHP] splits [year]" with actual numbers
4. Search "[stadium] [prop category] rate or factor"
5. Search "[opponent] vs [prop category] allowed [year]"
6. Search "THE CASE AGAINST: [opposing player] success vs [player]" — steelman other side
7. Check game script, weather, umpire tendencies, fatigue/pitch count limits
RULE: Individual matchup history is the PRIMARY signal. Team aggregates are context only.

PITCHER STRIKEOUT PROPS:
- "[pitcher] vs [team] batters career strikeout rate" — batter by batter, not team K%
- "[pitcher] strikeouts per game last 5 starts [year]"
- "[pitcher] K rate home vs away [year]"
- "umpire [name] strikeout rate per game [year]"
- "[stadium] strikeout rate vs league average"
- Check: opposing lineup L/R splits, elite contact hitters who rarely K, pitch count history

BATTER HIT/HR/RBI/TOTAL BASES PROPS:
- "[batter] vs [pitcher] career stats BA slugging K rate HR"
- "[batter] vs [LHP/RHP] splits [year]" with actual slash lines
- "[batter] home run rate [stadium] [year]"
- "[pitcher] HR allowed rate hits per 9 last 5 starts [year]"
- Check: lineup protection, park factor, weather/wind, recent game log hot/cold streak

═══════════════════════════════════════
NFL/NCAAF MANDATORY RESEARCH
═══════════════════════════════════════
- "[team] vs [team] line movement today" — opening line vs current, sharp money direction
- "[team] ATS record [year]" and "[team] ATS record as [home/road] [favorite/underdog] [year]"
- "[team] injury report [date]" — QB, WR1, LT, key defenders (Full/Limited/DNP)
- "[QB] completion % yards per attempt last 3 games [year]"
- "[team] O-line PFF grade vs [team] D-line PFF grade [year]"
- "[team] vs [team] DVOA offensive defensive [year]"
- "[team] pace plays per game vs [team] pace [year]"
- "[team] red zone TD% vs [team] red zone defense [year]"
- "[team] third down conversion rate vs [team] third down defense [year]"
- "weather [stadium city] wind speed direction temperature [date]" — wind 15mph+ kills passing and totals
- "[team] ATS record divisional games [year]" if divisional matchup
- "[team] home/road ATS record [year]"
- "[team] last 3 games ATS result scoring margin [year]"
- "sharp money [team] vs [team] [date]"
- KEY NUMBERS: -3, -7, -10, -14. Never lay -3.5 if -3 was available. Never take +2.5 when +3 exists.
- NCAAF additions: recruiting talent gap, home field crowd advantage, conference vs non-conference, transfer portal depth impact, rivalry game motivation, early vs late season conditioning

QB PROPS:
- "[QB] career stats vs [opponent] completion % yards TD/INT ratio"
- "[QB] last 3 games passing stats [year]"
- "[opponent] pass defense yards per attempt coverage scheme blitz rate [year]"
- Check: Vegas total, weather, game script, WR1/WR2/TE1 health, O-line injuries

RB PROPS:
- "[RB] career rushing yards per game vs [opponent]"
- "[opponent] rush defense DVOA yards per carry stuff rate [year]"
- "[RB] snap share % target share last 3 games [year]"
- Check: O-line run blocking grade, D-line injuries, bellcow vs committee, game script, weather

WR/TE PROPS:
- "[WR/TE] target share last 3 games [year]"
- "[CB covering WR] yards allowed per coverage snap PFF grade [year]"
- "[WR/TE] vs [opponent] career receiving stats"
- Check: shadow coverage, slot vs outside, safety help, red zone targets, route participation %

KEY NFL PRINCIPLES:
1. Game script drives volume — trailing = passing, leading = rushing
2. Weather kills passing, boosts rushing (wind 15+ mph is a hard line)
3. O-line injuries are the most underpriced market inefficiency
4. Divisional games = lower scoring, tighter matchups historically
5. KEY NUMBERS: -3, -7, -10, -14 are the most important margins in football
6. ATS records matter in specific situations — home favorites, road dogs, divisional, off bye, off loss
7. Reverse line movement = sharp money signal
8. Closing line value: beating the closing number = positive CLV

═══════════════════════════════════════
NBA MANDATORY RESEARCH
═══════════════════════════════════════
- "[player] playing tonight [date]" — mandatory for any team bet
- "[team] back to back schedule [date]" — second night B2B = major fade signal
- "[team] offensive rating defensive rating pace last 10 games [year]"
- "[team] vs [team] line movement today"
- "[team] ATS record [year]"
- "referee assignment [team] vs [team] [date]" — high foul refs inflate totals and FT lines
- Bench scoring differential, clutch performance last 5 close games

POINTS PROPS:
- "[player] usage rate last 5 games [year]"
- "[player] points vs [opponent] career and last 3 matchups"
- "[defender] defensive rating vs [player position] [year]"
- Check: load management risk, opponent pace, home/away splits, teammate injuries affecting usage

REBOUNDS PROPS:
- "[player] rebound rate last 5 games [year]"
- "[opponent] offensive/defensive rebound rate [year]"
- Check: frontcourt matchup size, pace, opposing big men rebounding ability

ASSISTS PROPS:
- "[player] assist rate and usage in pick and roll [year]"
- "[opponent] turnover rate and defensive scheme [year]"
- Check: teammate shooting health, pace, primary vs secondary ballhandler role

THREE-POINTER PROPS:
- "[player] three point attempt rate and percentage last 10 games [year]"
- "[opponent] three points allowed per game and defense ranking [year]"
- Check: game script blowout risk, home/away splits

═══════════════════════════════════════
NHL MANDATORY RESEARCH
═══════════════════════════════════════
- "[team] starting goalie tonight [date]" — NEVER recommend without confirmed starter
- "[goalie] save % GAA last 10 starts [year]"
- "[team] power play % penalty kill % last 10 games [year]"
- "[team] ATS record puck line [year]"
- "[team] vs [team] line movement today"
- PDO regression: team shooting% + save% far above 1.000 = regression coming
- High-danger scoring chance rate

SHOTS ON GOAL PROPS:
- "[player] shots on goal per game last 10 games [year]"
- "[opponent] shots allowed per game and shot suppression rate [year]"
- Check: power play unit position, ice time trend, line deployment

POINTS/GOALS PROPS:
- "[player] points per game last 10 games and career vs [opponent]"
- "[opponent] goals allowed per game and high-danger chances allowed [year]"
- Check: power play deployment, line chemistry, opposing goalie save%, home/away splits

═══════════════════════════════════════
SOCCER MANDATORY RESEARCH
═══════════════════════════════════════
- "[team] xG xGA last 5 matches [year]"
- "[team] form last 5 home/away [year]"
- "[team] vs [team] line movement today"
- "[team] injury and rotation risk [date]"
- "PPDA press intensity [team] [year]"
- European hangover / squad rotation risk
- Referee card rate and penalty call tendency

═══════════════════════════════════════
UFC MANDATORY RESEARCH
═══════════════════════════════════════
- "[fighter] replacement or injury [event]" — late replacement < 2 weeks = major fade
- "[fighter] weigh-in result [event]"
- "judge assignment [event] [date]"
- "[fighter] finish rate vs decision rate [year]"
- Styles matchup: striker vs grappler, wrestling vs BJJ
- Weight cut severity, camp quality, venue altitude

METHOD OF VICTORY PROPS:
- "[fighter] finish rate by method KO/TKO vs submission vs decision [year]"
- "[opponent] durability and finish rate against [year]"
- Check: styles matchup, judge tendencies, championship rounds

═══════════════════════════════════════
GOLF MANDATORY RESEARCH
═══════════════════════════════════════
- "[player] strokes gained [category] at [course] career last 3 years"
- "[player] strokes gained approach putting off-the-tee around-the-green [year]"
- "[player] recent form last 4 events [year]"
- "[player] driving distance vs course length fit"
- "[player] cut made % on [course type] [year]"
- Tee time draw weather window, caddie experience

MATCHUP PROPS:
- "[player A] vs [player B] head to head results [year]"
- Check: tee time draw, course fit, recent form trajectory

═══════════════════════════════════════
TENNIS MANDATORY RESEARCH
═══════════════════════════════════════
- "[player] surface win % [year]"
- "[player A] vs [player B] head to head on [surface]"
- "[player] recent match load and fatigue [year]"
- "[player] tiebreak win % [year]"
- "[player] performance vs top 10 vs lower-ranked [year]"
- Court speed rating, altitude effects
- First serve % trend last 3 matches

═══════════════════════════════════════
COLLEGE SPORTS
═══════════════════════════════════════
NCAAF (beyond NFL factors):
- Recruiting talent gap (blue chip ratio)
- Home field crowd advantage (top 10 atmospheres)
- Conference vs non-conference performance
- Transfer portal impact on depth
- Rivalry game motivation overrides recent form

NCAAB (beyond NBA factors):
- Recruiting class talent gap
- Coach tournament experience
- Conference familiarity (3-4x/year)
- Home court advantage amplified vs pros
- Exam week performance dip

College Baseball:
- Mid-week vs weekend rotation (aces pitch Fridays)
- Regional weather variability
- Regional altitude parks

═══════════════════════════════════════
WRITING STANDARDS — NON-NEGOTIABLE
═══════════════════════════════════════
- Use bold section headers
- Cite specific numbers and stats — RECENT stats, not season averages when recent form differs
- Name the key players, pitchers, quarterbacks
- Show the mismatch clearly on BOTH sides — your team AND the opposing offense
- Always note: opposing team's recent record — are they hot or cold RIGHT NOW?
- Always note where sharp money is pointing and line movement direction
- Always note if you are on or off a key number (NFL/NCAAF)
- Always note if you considered and rejected a play — briefly explain why
- Minimum 200 words per insight
- Never be vague — every claim needs a real recent stat behind it
- Never cherry-pick one side — steelman the other side before committing
- If recommending against a historically strong team, explicitly address why
- This is what bettors are paying for — make the case compellingly like a professional handicapper
- CRITICAL: Never use citation tags, reference tags, or any XML/HTML tags in your response. No <cite>, no <ref>, no markdown links. Plain text and bold headers only.
- CRITICAL: Every stat in each insight must be about one of the two teams in THAT pick only. Never bleed stats from other games into a pick. If not relevant to this exact matchup, delete it.

CRITICAL: Your final JSON must include a "research_log" field — a simple array of every search query you ran, in order. This is checked programmatically. Do not fabricate entries; list only searches you actually performed.`;

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system,
    messages: [{
      role: 'user',
      content: `Today is ${today_display}. Available games with current lines: ${gamesContext}

EXECUTE THE MANDATORY RESEARCH AND SELECTION PROCESS NOW on the candidate pool above. Run at least ${MIN_SEARCHES_REQUIRED} total web searches. Do not skip any step.

After completing research, return ONLY this raw JSON with no markdown, no citations, no cite tags:
{"research_log":["search query 1","search query 2","..."],"picks":[{"sport":"...","game":"EXACT game name from the feed above","pick":"...","odds":"...","confidence":"High|Medium|Low","units":2,"game_time":"H:MM PM ET","insight":"DETAILED multi-paragraph breakdown with bold section headers, specific recent stats with actual numbers, pitcher names, line movement direction, sharp money signals, opposing offense analysis, and why you rejected other plays. MINIMUM 200 words. NO citation tags."}]}

UNIT SIZING: High confidence = 2 units. Medium = 1 unit. Low = 0.5 units. Never exceed 2 units.
CRITICAL: Every game name must EXACTLY match a game from the feed. Never invent games. Never use memory for stats — web search only.`
    }],
  });

  return { response, system };
}

async function generatePicks() {
  const startTime = Date.now();
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

  // Ground-truth spread lookup: gameKey -> { teamName: signedPoint }
  // Built from the raw odds feed, BEFORE any text is generated by Claude.
  // This is the source of truth we use to correct the sign on every spread/run-line
  // pick after generation, instead of trusting the model's text to get +/- right.
  //
  // IMPORTANT: we do NOT just trust whatever point value the spread market lists
  // per team — bookmaker feeds can occasionally have the two outcomes' points
  // mislabeled/swapped relative to the moneyline. The moneyline favorite/underdog
  // relationship is a much more reliable signal: the ML favorite (negative price)
  // must always have the negative spread. If the raw spread data disagrees with
  // that, we trust the moneyline and flip the spread signs to match, logging it.
  const spreadLookup = {};
  (oddsData.games || []).forEach(g => {
    const gameKey = `${g.away_team} @ ${g.home_team}`;
    const bm = g.bookmakers?.[0];
    const h2hMarket = bm?.markets?.find(m => m.key === 'h2h');
    const spreadMarket = bm?.markets?.find(m => m.key === 'spreads');
    if (!spreadMarket) return;

    const rawPoints = {};
    spreadMarket.outcomes?.forEach(o => { rawPoints[o.name] = o.point; });

    const teamNames = Object.keys(rawPoints);
    if (teamNames.length !== 2) {
      spreadLookup[gameKey] = rawPoints;
      return;
    }

    // Determine the moneyline favorite (negative price = favorite).
    let mlFavorite = null;
    if (h2hMarket) {
      const favOutcome = h2hMarket.outcomes?.find(o => o.price < 0);
      if (favOutcome) mlFavorite = favOutcome.name;
    }

    if (mlFavorite && rawPoints[mlFavorite] !== undefined) {
      const favoritePoint = rawPoints[mlFavorite];
      if (favoritePoint > 0) {
        // Spread data contradicts the moneyline — the favorite should never
        // have a positive spread. Flip both signs to match the moneyline,
        // which is the more reliable signal here.
        console.log(`ODDS_FEED_SPREAD_INVERTED: "${gameKey}" — ML favorite "${mlFavorite}" had positive spread (${favoritePoint}) in raw feed. Correcting to match moneyline direction.`);
        const corrected = {};
        teamNames.forEach(name => { corrected[name] = -rawPoints[name]; });
        spreadLookup[gameKey] = corrected;
        return;
      }
    }

    spreadLookup[gameKey] = rawPoints;
  });

  const slimGames = (oddsData.games || [])
    .filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound)
    .slice(0, 20)
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
        sport_key: g.sport_key,
      };
    });

  // Enrich MLB games with confirmed starting pitchers from MLB Stats API
  try {
    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&gameType=R&hydrate=probablePitcher`
    );
    const mlbData = await mlbRes.json();
    const mlbSchedule = mlbData.dates?.[0]?.games || [];
    for (const game of slimGames) {
      if (game.sport_key !== 'baseball_mlb') continue;
      const awayTeam = game.game.split(' @ ')[0].toLowerCase();
      const homeTeam = game.game.split(' @ ')[1].toLowerCase();
      const match = mlbSchedule.find(s => {
        const sAway = s.teams?.away?.team?.name?.toLowerCase() || '';
        const sHome = s.teams?.home?.team?.name?.toLowerCase() || '';
        return sAway.split(' ').some(w => w.length > 3 && awayTeam.includes(w)) ||
               sHome.split(' ').some(w => w.length > 3 && homeTeam.includes(w));
      });
      if (match) {
        const awayPitcher = match.teams?.away?.probablePitcher?.fullName;
        const homePitcher = match.teams?.home?.probablePitcher?.fullName;
        if (awayPitcher) game.away_starter = `${game.game.split(' @ ')[0]} starter: ${awayPitcher}`;
        if (homePitcher) game.home_starter = `${game.game.split(' @ ')[1]} starter: ${homePitcher}`;
      }
    }
  } catch (e) {
    console.error('Pitcher enrichment error:', e.message);
  }

  const gamesContext = JSON.stringify(slimGames);
  const sportsAvailable = [...new Set(slimGames.map(g => g.sport))];
  const today_display = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  // Build recent-picks memory to prevent repetitive team bias
  const recentPicksMemory = await buildRecentPicksMemory();
  console.log('Recent picks memory built. Length:', recentPicksMemory.length);

  // ── STAGE 1: Candidate Pool ──────────────────────────────────────────
  let candidatePool = await buildCandidatePool(gamesContext, today_display, recentPicksMemory, sportsAvailable);
  let poolProblems = validateCandidatePool(candidatePool);

  if (poolProblems.length > 0 && Date.now() - startTime < TIME_BUDGET_MS) {
    console.log('Candidate pool validation failed, retrying once:', poolProblems);
    const correctionNote = `\n\nYOUR PREVIOUS CANDIDATE POOL WAS REJECTED for these reasons:\n${poolProblems.map(p => `- ${p}`).join('\n')}\nFix these issues and return a corrected candidate pool.`;
    const retryPool = await buildCandidatePool(gamesContext, today_display, recentPicksMemory + correctionNote, sportsAvailable);
    const retryProblems = validateCandidatePool(retryPool);
    // Use the retry regardless — it's the best we'll get without spiraling retries.
    // Log if still imperfect so we can see it in Vercel logs.
    if (retryProblems.length > 0) {
      console.log('Candidate pool still imperfect after retry, proceeding anyway:', retryProblems);
    }
    candidatePool = retryPool;
  } else if (poolProblems.length > 0) {
    console.log('Candidate pool validation failed but time budget exceeded, proceeding anyway:', poolProblems);
  }

  // ── STAGE 2: Deep Research + Final Picks ─────────────────────────────
  let { response: research, system: stage2System } = await runDeepResearch(gamesContext, today_display, candidatePool, recentPicksMemory);
  let searchCount = countSearches(research.content);
  console.log('Stage 2 stop_reason:', research.stop_reason, 'search count:', searchCount);

  // If the first call came back essentially empty (e.g. a transient API hiccup),
  // log it for visibility — but do NOT retry the whole call from scratch here.
  // A full extra Stage 2 attempt can itself take 60-90+ seconds, and stacking
  // that on top of the continuation below risks blowing the 300s function
  // timeout. The continuation path below (with the full system prompt now
  // correctly attached) is sufficient to recover without that added risk.
  if (!research.content || research.content.length === 0) {
    console.log('NOTE: Stage 2 first attempt came back with no content (stop_reason undefined). Proceeding to continuation below rather than a full retry, to protect the time budget.');
  }

  let text = extractText(research.content);

  // If under-researched and we still have time budget, push back once with a specific correction.
  // CRITICAL: always include the system prompt here — never rely solely on prior
  // turns for instructions, since if the prior turn was thin or malformed the
  // model would have zero idea what JSON schema to return.
  if (searchCount < MIN_SEARCHES_REQUIRED && Date.now() - startTime < TIME_BUDGET_MS && research.stop_reason !== 'max_tokens') {
    console.log(`Only ${searchCount} searches performed, minimum is ${MIN_SEARCHES_REQUIRED}. Requesting more research.`);
    const continueResponse = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: stage2System,
      messages: [
        ...(research.content && research.content.length > 0 ? [{ role: 'assistant', content: research.content }] : []),
        {
          role: 'user',
          content: `You have only performed ${searchCount} searches so far. The minimum required is ${MIN_SEARCHES_REQUIRED}. Continue researching now — check bullpen usage, weather, umpire tendencies, line movement, or opposing offense recent form for candidates you haven't fully covered yet. Then return the final JSON with the complete research_log listing every search you have run (including the ones already done). Remember the required JSON format: {"research_log":["..."],"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","units":2,"game_time":"H:MM PM ET","insight":"..."}]}`
        }
      ],
    });
    searchCount = countSearches(continueResponse.content) + searchCount;
    text = extractText(continueResponse.content) || text;
    console.log('After continuation, stop_reason:', continueResponse.stop_reason, 'total search count:', searchCount);
    research = continueResponse;
  }

  // Final safety net: if no text, or stopped mid-turn (tool_use / pause_turn),
  // force a clean JSON-only reply. pause_turn is a real Anthropic stop_reason
  // for long agentic turns that pause partway through — treating it as final
  // would mean parsing the model's mid-sentence reasoning as JSON, which fails.
  if (!text.trim() || research.stop_reason === 'tool_use' || research.stop_reason === 'pause_turn') {
    console.log(`Response not final (stop_reason: ${research.stop_reason}), forcing final JSON retry...`);
    const retryResponse = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'You are Hunter. Return ONLY the raw JSON picks object with no other text. No markdown, no explanation.',
      messages: [
        ...(research.content && research.content.length > 0 ? [{ role: 'assistant', content: research.content }] : []),
        { role: 'user', content: 'Now return ONLY the final JSON picks object, including research_log. Format: {"research_log":["..."],"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","units":2,"game_time":"H:MM PM ET","insight":"..."}]}' }
      ],
    });
    text = extractText(retryResponse.content);
    console.log('Final retry stop_reason:', retryResponse.stop_reason);
  }

  if (!text.trim()) throw new Error('No text content returned from Claude after all retries');

  let parsed;
  try {
    parsed = cleanJson(text);
  } catch (parseErr) {
    // Last-resort fallback: even after the forced-JSON retry above, the text
    // still wasn't parseable (could be a stop_reason we haven't seen yet, or
    // another transient issue). Try one more explicit forced-JSON call before
    // giving up entirely — but only if there's still time budget for it, so
    // this can't stack up into another 300s timeout.
    console.log('First JSON parse failed after retry, attempting one final forced-JSON call:', parseErr.message);
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      throw new Error(`No valid JSON after all retries, and time budget exhausted: ${parseErr.message}`);
    }
    const lastResort = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'You are Hunter. Return ONLY the raw JSON picks object with no other text. No markdown, no explanation, no commentary.',
      messages: [
        { role: 'user', content: `Return ONLY this JSON format based on your prior research, nothing else: {"research_log":["..."],"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","units":2,"game_time":"H:MM PM ET","insight":"..."}]}. Here is your prior partial output to base it on: ${text.slice(0, 3000)}` }
      ],
    });
    const lastText = extractText(lastResort.content);
    parsed = cleanJson(lastText);
  }
  if (!parsed.picks) throw new Error('Invalid format — no picks array');

  console.log('Final research_log length:', (parsed.research_log || []).length, 'picks:', parsed.picks.length);

  // Correct any spread/run-line sign errors using ground-truth odds data,
  // rather than trusting the model's generated text for the +/- sign.
  const correctedPicks = parsed.picks.map(p => normalizeSpreadSign(p, spreadLookup));

  const rows = correctedPicks.map(p => ({
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

  console.log(`Successfully generated ${rows.length} picks for ${today}. Total elapsed: ${Date.now() - startTime}ms`);
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
