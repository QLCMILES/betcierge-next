import { createClient } from '@supabase/supabase-js';

// Synchronous by design (not Batches API) — this step needs a guaranteed
// timely response right up against each candidate's own publish deadline.
// Intended cron cadence: every 2-3 minutes.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Same "material move" thresholds used in research-scheduler's pre-flight
// freshness check — kept consistent across both gates.
const MONEYLINE_REJECT_CENTS = 50;
const POINT_REJECT = 3.0;

const OFFICIAL_SCORE_THRESHOLD = 7.0;
// Totals get their own, deliberately higher bar than sides (moneyline, run
// line/spread) — real July 20 data showed totals going 0-6 across both
// tiers that day while every side won. This isn't "totals never hit," it's
// "the same threshold that works for sides doesn't reliably work for
// totals" — so totals now need a genuinely higher score to appear at all,
// and are capped at 2 per day regardless of sport, on top of the existing
// per-sport correlation cap. Stage 1 also now runs a real verification
// pass on totals before they even reach this stage — these two layers
// work together, not as alternatives to each other.
const TOTAL_LEAN_FLOOR = 7.0;
const TOTAL_OFFICIAL_THRESHOLD = 8.5;
const MAX_TOTALS_PER_DAY = 2;
const LEAN_SCORE_FLOOR = 6.0;
const DAILY_OFFICIAL_CAP = 3;
const CORRELATION_CAP_PER_SPORT_BETTYPE = 2;
const ELITE_OVERRIDE_THRESHOLD = 8.5; // a pick this strong publishes even if the daily cap is already full — "too good not to put out." Does NOT override the correlation cap, which is a risk-concentration guard, not a quality gate.

// Same logic as settle-bets.js's inferBetType() — deriving from the ACTUAL
// final pick text, not the Stage 1 label. Stage 1's bet_type is a guess
// made before real research; Stage 2 can (correctly) land on a completely
// different bet type once the research is done (e.g. "moneyline" candidate
// becomes a run line pick). Using the stale label here would feed wrong
// data into the correlation cap, which reads this exact field.
//
// Stage 2 sometimes embeds odds directly in the pick text (e.g. "Giants ML
// +120") and sometimes doesn't (e.g. "Chicago Cubs ML") — inconsistent
// output, not something to special-case. Strip the known odds value out
// first if present, so an embedded "+120" doesn't get misread as a spread
// number and misclassify a moneyline pick as a runline.
function inferBetTypeFromPickText(pickText, oddsText) {
  if (!pickText) return 'unknown';
  let p = pickText.toLowerCase();
  if (oddsText) {
    p = p.split(oddsText.toLowerCase().trim()).join('');
  }
  if (p.includes(' & ') || p.includes(' and ')) return 'combo';
  if (p.includes('both teams to score') || p.includes('btts')) return 'btts';
  if ((p.includes('over') || p.includes('under')) && p.match(/\d+\.?\d*/)) return 'total';
  if (p.match(/[+-]\d+\.?\d+/) && !p.match(/^[+-]\d{3,}$/)) return 'runline';
  if (p.includes(' ml') || p.endsWith(' ml') || p.includes('moneyline')) return 'moneyline';
  return 'moneyline';
}

function parseOddsString(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split(',')) {
    const match = part.trim().match(/^(.+?):\s*(-?\d+(\.\d+)?)$/);
    if (match) out[match[1].trim()] = parseFloat(match[2]);
  }
  return out;
}

function parsePointsString(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split(',')) {
    const match = part.trim().match(/^(.+?)\s(-?\d+(\.\d+)?):\s*-?\d+$/);
    if (match) out[match[1].trim()] = parseFloat(match[2]);
  }
  return out;
}

function checkFreshness(originalMoneyline, freshMoneyline, originalSpread, freshSpread) {
  const origML = parseOddsString(originalMoneyline);
  const freshML = parseOddsString(freshMoneyline);
  for (const team of Object.keys(origML)) {
    if (freshML[team] === undefined) continue;
    const diff = Math.abs(freshML[team] - origML[team]);
    if (diff >= MONEYLINE_REJECT_CENTS) {
      return { stale: true, reason: `Moneyline moved ${diff} cents on ${team} since research (${origML[team]} \u2192 ${freshML[team]})` };
    }
  }
  const origPts = parsePointsString(originalSpread);
  const freshPts = parsePointsString(freshSpread);
  for (const team of Object.keys(origPts)) {
    if (freshPts[team] === undefined) continue;
    const diff = Math.abs(freshPts[team] - origPts[team]);
    if (diff >= POINT_REJECT) {
      return { stale: true, reason: `Spread moved ${diff} points on ${team} since research (${origPts[team]} \u2192 ${freshPts[team]})` };
    }
  }
  return { stale: false, reason: null };
}

async function fetchLiveOddsForGame(gameName) {
  const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds', { method: 'POST' });
  const oddsData = await oddsRes.json();
  const match = (oddsData.games || []).find(g => `${g.away_team} @ ${g.home_team}` === gameName);
  if (!match) return null;
  const bm = match.bookmakers?.[0];
  const h2h = bm?.markets?.find(m => m.key === 'h2h');
  const spread = bm?.markets?.find(m => m.key === 'spreads');
  const total = bm?.markets?.find(m => m.key === 'totals');
  return {
    moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', ') || null,
    spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', ') || null,
    total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', ') || null,
  };
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

// ── Final lineup-currency check ──────────────────────────────────────────
// A small, targeted, SYNCHRONOUS call (not the Batches API, not a full
// Stage 2 re-research) that re-checks only the specific named participants
// this pick actually depends on, and returns a WEIGHTED score adjustment
// rather than a flat keep/discard bucket. A minor bench change on a 9.0
// pick should barely move it; a real problem on a 7.2 pick should be able
// to sink it below the Lean floor entirely. Same 6.0/7.0 thresholds apply
// to the adjusted score afterward — no separate decision tree.
async function checkLineupCurrency(candidate) {
  const elig = candidate.eligibility || {};
  const confirmedNames = elig.confirmed_names || [];
  const pickText = candidate.research_log?.pick || candidate.odds || '(pick text unavailable)';

  const system = `You are Hunter. Right before publishing this pick, confirm the specific participants it depends on are STILL accurate — things can change in the time since research completed.

Game: ${candidate.game} (${candidate.sport})
Pick: ${pickText}
Original score: ${candidate.score}/10
Confirmed at research time: ${confirmedNames.join('; ') || '(none recorded)'}

Search for any news since research completed that could affect ONLY the specific participants named above — not a general news scan of the whole game.

Use real judgment on how much any change matters to THIS specific pick, not a flat rule. Some guidance based on how each sport typically behaves:
- MLB: batting-order changes matter roughly in proportion to that hitter's importance — a #2 or #3 hitter scratched matters far more than a #8 or #9 hitter.
- NBA/NCAAB: the most sensitive sport to late lineup swaps of any you cover — a non-superstar starter changing can still meaningfully shift a game's shape. Weight accordingly.
- NHL: a goalie change this close to puck drop is rare and can be significant — weight it heavily, but this is NOT an automatic-cancel case (see below), reason about it like any other change.
- NFL/soccer: only the specific players actually named above are relevant — an unrelated bench player's status has no bearing on this specific pick.

AUTOMATIC CANCEL — separate from the weighted adjustment above. Exactly three cases end the pick outright, no matter how strong the original score was, because these three roles are load-bearing for the entire pick in a way no adjustment number can capture:
1. MLB: the confirmed STARTING PITCHER for either team is no longer accurate.
2. NFL/NCAAF: the confirmed STARTING QUARTERBACK for either team is no longer accurate.
3. NBA/NCAAB: a team's clear best/focal player — the one whose absence would fundamentally change how the game plays out, not just any starter — is no longer accurate.
Nothing else triggers automatic cancel, including an NHL goalie change — weight those through the adjustment instead.

Return ONLY this JSON, no other text:
{
  "any_change_detected": true or false,
  "changes": [{"player": "...", "what_changed": "...", "source": "..."}],
  "automatic_cancel_triggered": true or false,
  "automatic_cancel_reason": "which of the three specific roles triggered this, or null",
  "score_adjustment": a number from -5.0 to 0 (0 = nothing meaningful changed, more negative = more damaging to this specific pick — never positive, this check only detects degradation),
  "adjustment_reasoning": "one or two plain-language sentences a bettor would understand"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: `Check currency now for ${candidate.game} and return the JSON.` }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });
  const data = await response.json();
  const text = extractText(data.content);
  if (!text.trim()) throw new Error('Lineup-currency check returned no text');
  return cleanJson(text);
}

// ── SMS hook — STUB. Twilio is not wired up yet. This is the intended call
// site: once Twilio is configured, replace the body of this function only.
// Only fires for tier='official' picks (per current product decision — Lean
// Machine notifications are a separate, opt-in feature, not yet built).
async function sendPickSMS(pickRow) {
  console.log(`SMS_STUB: would notify opted-in Team/Edge users \u2014 "${pickRow.game}" (${pickRow.pick}) is now official.`);
  // TODO(Twilio): send to all opted-in Team/Edge users, then:
  // await supabase.from('daily_picks').update({ sms_sent_at: new Date().toISOString() }).eq('id', pickRow.id);
  return null;
}

async function finalizePicks() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const now = new Date();

  const { data: candidates, error } = await supabase
    .from('game_candidates')
    .select('*')
    .eq('date', today)
    .eq('status', 'awaiting_confirmation')
    .eq('research_status', 'researched')
    .lte('publish_deadline_at', now.toISOString())
    .order('publish_deadline_at', { ascending: true }); // first-come-first-served, matches the "unlock as confirmed" model, not end-of-day ranking

  if (error) throw error;
  if (!candidates || candidates.length === 0) {
    console.log('No candidates have crossed their publish deadline this run.');
    return;
  }

  console.log(`${candidates.length} candidate(s) crossed their publish deadline \u2014 finalizing.`);

  for (const candidate of candidates) {
    try {
      // ── Final freshness re-check ──────────────────────────────────────
      // Compares against fresh_moneyline/fresh_spread \u2014 the snapshot
      // taken at Stage 2 research-submission time \u2014 not the morning's
      // original snapshot, since that's the most recent honest baseline.
      const liveOdds = await fetchLiveOddsForGame(candidate.game);
      if (!liveOdds) {
        console.log(`FINAL_STALE_VANISHED: "${candidate.game}" no longer in live odds feed \u2014 discarding.`);
        await supabase.from('game_candidates').update({
          status: 'discarded_stale_final',
          notes: 'Game no longer found in live odds feed at final-confirmation time.',
        }).eq('id', candidate.id);
        continue;
      }
      const freshness = checkFreshness(
        candidate.fresh_moneyline, liveOdds.moneyline,
        candidate.fresh_spread, liveOdds.spread
      );
      if (freshness.stale) {
        console.log(`FINAL_STALE_LINE_MOVE: "${candidate.game}" \u2014 ${freshness.reason} \u2014 discarding rather than publishing a dead edge.`);
        await supabase.from('game_candidates').update({
          status: 'discarded_stale_final',
          notes: `Discarded at final confirmation: ${freshness.reason}`,
        }).eq('id', candidate.id);
        continue;
      }

      // \u2500\u2500 Final lineup-currency check \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      const currency = await checkLineupCurrency(candidate);

      if (currency.automatic_cancel_triggered === true) {
        console.log(`FINAL_LINEUP_AUTOCANCEL: "${candidate.game}" \u2014 ${currency.automatic_cancel_reason || 'key role changed'} (${JSON.stringify(currency.changes)}) \u2014 discarding outright, this is one of the three roles no adjustment can capture.`);
        await supabase.from('game_candidates').update({
          status: 'discarded_key_player_out',
          notes: `Final lineup check \u2014 automatic cancel: ${currency.automatic_cancel_reason || currency.adjustment_reasoning || 'key role no longer confirmed'}`,
        }).eq('id', candidate.id);
        continue;
      }

      const adjustment = Math.max(-5.0, Math.min(0, currency.score_adjustment || 0)); // never allow a positive adjustment
      const originalScore = candidate.score;
      const score = Math.max(0, originalScore + adjustment);

      if (currency.any_change_detected) {
        console.log(`FINAL_LINEUP_ADJUSTED: "${candidate.game}" \u2014 ${originalScore} \u2192 ${score} (${adjustment}) \u2014 ${currency.adjustment_reasoning || 'no reasoning given'}`);
      }

      const pick = candidate.research_log || {};
      // Derive from the ACTUAL final pick text, not candidate.bet_type (the
      // stale Stage 1 guess) — see inferBetTypeFromPickText() above for why.
      const betType = inferBetTypeFromPickText(pick.pick, pick.odds) || candidate.bet_type || 'unknown';

      const isTotal = betType === 'total';
      const effectiveLeanFloor = isTotal ? TOTAL_LEAN_FLOOR : LEAN_SCORE_FLOOR;
      const effectiveOfficialThreshold = isTotal ? TOTAL_OFFICIAL_THRESHOLD : OFFICIAL_SCORE_THRESHOLD;

      if (isTotal) {
        const { data: totalsToday } = await supabase
          .from('daily_picks')
          .select('id', { count: 'exact' })
          .eq('date', today)
          .eq('bet_type', 'total');
        if ((totalsToday || []).length >= MAX_TOTALS_PER_DAY) {
          console.log(`FINAL_TOTALS_DAILY_CAP: "${candidate.game}" is a total but today's slate already has ${MAX_TOTALS_PER_DAY} totals published (any tier) — discarding rather than adding another, regardless of this candidate's own score.`);
          await supabase.from('game_candidates').update({
            status: 'discarded_totals_daily_cap',
          }).eq('id', candidate.id);
          continue;
        }
      }

      if (score < effectiveLeanFloor) {
        console.log(`FINAL_BELOW_LEAN_FLOOR: "${candidate.game}" (${betType}) scored ${score}, below ${effectiveLeanFloor} — not shown anywhere.`);
        await supabase.from('game_candidates').update({
          status: 'discarded_low_score',
        }).eq('id', candidate.id);
        continue;
      }

      // Correlation cap now checks BOTH tiers combined for this sport+bet_type
      // today — a Lean pick of a given type occupies a real "slot" in the
      // day's slate just as much as an Official one does, so it must count
      // against new candidates of either tier, not just against would-be-
      // Official ones. Previously, anything scoring 6.0-6.9 skipped this
      // check entirely and went straight to Lean with no concentration
      // limit at all — this is the fix for that gap.
      const { data: sameTypeAnyTierToday } = await supabase
        .from('daily_picks')
        .select('id', { count: 'exact' })
        .eq('date', today)
        .eq('sport', candidate.sport)
        .eq('bet_type', betType);

      const correlationCapHit = (sameTypeAnyTierToday || []).length >= CORRELATION_CAP_PER_SPORT_BETTYPE;

      let tier = 'lean';
      let missReason = 'score';

      if (correlationCapHit && score >= effectiveOfficialThreshold) {
        tier = 'lean';
        missReason = 'correlation_cap';
        console.log(`FINAL_CORRELATION_CAP: "${candidate.game}" scored ${score} (would be official) but ${candidate.sport}/${betType} already has ${CORRELATION_CAP_PER_SPORT_BETTYPE} picks (any tier) today \u2014 publishing as Lean Machine instead. The elite override does NOT apply here \u2014 correlation risk is a separate concern from pick quality.`);
      } else if (correlationCapHit) {
        missReason = 'lean_correlation_cap';
        console.log(`FINAL_LEAN_CORRELATION_CAP: "${candidate.game}" scored ${score} but ${candidate.sport}/${betType} already has ${CORRELATION_CAP_PER_SPORT_BETTYPE} picks (any tier) today \u2014 discarding rather than adding a third same-type pick to an already-concentrated slate.`);
        await supabase.from('game_candidates').update({
          status: 'discarded_lean_correlation_cap',
        }).eq('id', candidate.id);
        continue;
      } else if (score >= effectiveOfficialThreshold) {
        const { data: officialToday } = await supabase
          .from('daily_picks')
          .select('id', { count: 'exact' })
          .eq('date', today)
          .eq('tier', 'official');

        if ((officialToday || []).length >= DAILY_OFFICIAL_CAP && score < ELITE_OVERRIDE_THRESHOLD) {
          tier = 'lean';
          missReason = 'daily_cap';
          console.log(`FINAL_DAILY_CAP: "${candidate.game}" scored ${score} (would be official) but today's slate already has ${DAILY_OFFICIAL_CAP} official picks \u2014 publishing as Lean Machine instead. Did not qualify for the ${ELITE_OVERRIDE_THRESHOLD}+ elite override.`);
        } else if ((officialToday || []).length >= DAILY_OFFICIAL_CAP && score >= ELITE_OVERRIDE_THRESHOLD) {
          tier = 'official';
          missReason = null;
          console.log(`FINAL_ELITE_OVERRIDE: "${candidate.game}" scored ${score} \u2014 today's daily cap of ${DAILY_OFFICIAL_CAP} was already full, but this score cleared the ${ELITE_OVERRIDE_THRESHOLD} elite bar, so it publishes as official anyway \u2014 too good to hold back.`);
        } else {
          tier = 'official';
          missReason = null;
        }
      }

      const { data: inserted, error: insertErr } = await supabase.from('daily_picks').insert({
        date: today,
        sport: candidate.sport,
        game: candidate.game,
        bet_type: betType,
        pick: pick.pick || null,
        odds: candidate.odds || pick.odds || null,
        units: candidate.units || pick.units || null,
        confidence: pick.confidence || null,
        insight: candidate.insight || pick.insight || null,
        result: 'Pending',
        status: 'active',
        game_time: candidate.game_time,
        tier,
        miss_reason: missReason,
        game_candidate_id: candidate.id,
        score,
        original_score: originalScore,
        lineup_check_adjustment: adjustment,
        lineup_check_notes: currency.any_change_detected ? (currency.adjustment_reasoning || null) : null,
      }).select().single();

      if (insertErr) throw insertErr;

      await supabase.from('game_candidates').update({
        status: tier === 'official' ? 'published_official' : 'published_lean',
      }).eq('id', candidate.id);

      console.log(`FINAL_PUBLISHED: "${candidate.game}" \u2014 tier=${tier}${missReason ? ` (miss_reason=${missReason})` : ''}, score=${score}`);

      if (tier === 'official') {
        await sendPickSMS(inserted);
      }
    } catch (err) {
      console.error(`Error finalizing candidate ${candidate.id} (${candidate.game}):`, err.message);
      // Left as awaiting_confirmation \u2014 will be retried next run. If this
      // keeps failing past the game's actual start time, it'll just never
      // publish, which is the safe failure direction.
    }
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const cronSecret = request.headers.get('x-cron-secret');
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await finalizePicks().catch(err => console.error('finalizePicks error:', err));
  return Response.json({ success: true, message: 'Finalize picks run complete' });
}

export async function POST(request) {
  return GET(request);
}
