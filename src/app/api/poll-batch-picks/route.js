import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60; // this just polls status and, on completion, does one parse+validate+write pass — should be fast
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_SEARCHES_REQUIRED = 15;

// Phase 1 hardening: dynamic pick count instead of a forced exactly-3.
// The model now scores every researched candidate honestly; code selects
// the final list based on this fixed, non-negotiable threshold — never
// adjusted based on how many candidates happen to clear it that day.
const MIN_SCORE_THRESHOLD = 7.0;
const MAX_DAILY_PICKS = 3;
// Correlation cap: avoid publishing 3 picks that could all lose together
// from one unusual game (e.g. three correlated unders). Not about cosmetic
// bet-type variety — this only intervenes when there's a real concentration
// of the same sport + bet type among the highest-scored candidates.
const MAX_SAME_SPORT_AND_TYPE = 2;

// Red-flag substrings that mean the model reported an eligibility field as
// technically "true" but the actual confirmed_names text still reads like
// an unconfirmed guess — a string-based safety net in case the boolean
// itself is wrong or gamed.
const UNCERTAIN_NAME_PATTERNS = ['tbd', 'not listed', 'unconfirmed', 'unknown', 'not confirmed', 'unclear', 'not yet announced'];

// Thresholds for the publish-time freshness check. These are starting
// defaults — reasonable, but worth revisiting once we've seen real
// distributions of line movement over a real batch processing window.
// Below the ANNOTATE threshold: no action. Between ANNOTATE and REJECT:
// annotate the insight with the line move rather than silently publishing
// stale reasoning as current. At or above REJECT: decline to publish that
// specific pick rather than presenting materially stale analysis as live.
const MONEYLINE_ANNOTATE_CENTS = 20;
const MONEYLINE_REJECT_CENTS = 50;
const POINT_ANNOTATE = 1.0;
const POINT_REJECT = 3.0;

function extractText(content) {
  return (content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

function countSearches(content) {
  return (content || []).filter(c => c.type === 'server_tool_use' && c.name === 'web_search').length;
}

function cleanJson(text) {
  const clean = text
    .replace(/```json|```/g, '')
    .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '')
    .trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in batch result: ' + text.slice(0, 300));
  return JSON.parse(jsonMatch[0]);
}

// Same spread-sign correction used in generate-picks, applied here against
// the ORIGINAL stored snapshot (not a live re-fetch) — preserves the
// "verify against what the model actually saw" property.
function normalizeSpreadSign(pick, spreadLookup) {
  const pickText = pick.pick || '';
  const isTotal = /\b(over|under)\b/i.test(pickText);
  const isAltLine = /\bf5\b|first\s*5|1h\b|first\s*half/i.test(pickText);
  if (isTotal || isAltLine) return pick;

  const match = pickText.match(/^(.*?)\s*([+-]?\d+(\.\d+)?)\s*$/);
  if (!match) return pick;
  const teamNamePart = match[1].trim();

  for (const gameKey of Object.keys(spreadLookup)) {
    const teams = Object.keys(spreadLookup[gameKey]);
    const matchedTeam = teams.find(t => teamNamePart.includes(t) || t.includes(teamNamePart));
    if (matchedTeam) {
      const correctPoint = spreadLookup[gameKey][matchedTeam];
      if (typeof correctPoint === 'number') {
        const sign = correctPoint > 0 ? '+' : '';
        return { ...pick, pick: `${teamNamePart} ${sign}${correctPoint}` };
      }
    }
  }
  return pick;
}

// Parse a simple numeric value out of the pre-joined display strings stored
// in slim_games (e.g. "Braves: -150, Pirates: +130") for a given team name,
// for the moneyline/spread/total freshness comparison below. Heuristic, not
// exact-parse — good enough for an annotation-first freshness signal.
function extractNumberForTeam(joinedStr, teamHint) {
  if (!joinedStr) return null;
  const parts = joinedStr.split(',').map(s => s.trim());
  const found = parts.find(p => p.includes(teamHint) || teamHint.includes(p.split(':')[0]?.trim() || ''));
  if (!found) return null;
  const num = found.match(/[+-]?\d+(\.\d+)?/);
  return num ? parseFloat(num[0]) : null;
}

function extractTotalNumber(joinedStr) {
  if (!joinedStr) return null;
  const num = joinedStr.match(/[+-]?\d+(\.\d+)?/);
  return num ? parseFloat(num[0]) : null;
}

// Publish-time freshness check: compare the pick's relevant number in the
// ORIGINAL stored snapshot against a FRESH live odds fetch taken right now,
// right before publishing. A meaningfully longer batch-processing window
// (vs. the old synchronous flow) means real line movement between research
// and publish is now a real risk that wasn't as pressing before — this
// check exists specifically because of that, separate from the game-
// verification gate (which checks correctness against the original
// snapshot, not freshness against the live market).
function checkFreshnessAndAnnotate(pick, originalSlimGames, liveSlimGames) {
  const originalGame = originalSlimGames.find(g => g.game === pick.game);
  const liveGame = liveSlimGames.find(g => g.game === pick.game);
  if (!originalGame || !liveGame) {
    return { pick, rejected: false, note: 'Could not find game in live odds for freshness check — proceeding without annotation.' };
  }

  const isTotal = /\b(over|under)\b/i.test(pick.pick || '');
  const isMoneyline = !isTotal && !/[+-]\d/.test(pick.pick || '');

  let oldVal = null, newVal = null, isPointBased = false;

  if (isTotal) {
    oldVal = extractTotalNumber(originalGame.total);
    newVal = extractTotalNumber(liveGame.total);
    isPointBased = true;
  } else if (isMoneyline) {
    const teamGuess = (pick.pick || '').trim();
    oldVal = extractNumberForTeam(originalGame.moneyline, teamGuess);
    newVal = extractNumberForTeam(liveGame.moneyline, teamGuess);
  } else {
    const teamGuess = (pick.pick || '').replace(/[+-]?\d+(\.\d+)?\s*$/, '').trim();
    oldVal = extractNumberForTeam(originalGame.spread, teamGuess);
    newVal = extractNumberForTeam(liveGame.spread, teamGuess);
    isPointBased = true;
  }

  if (oldVal === null || newVal === null) {
    return { pick, rejected: false, note: 'Could not parse old/new value for freshness check — proceeding without annotation.' };
  }

  const diff = Math.abs(newVal - oldVal);
  const annotateThreshold = isPointBased ? POINT_ANNOTATE : MONEYLINE_ANNOTATE_CENTS;
  const rejectThreshold = isPointBased ? POINT_REJECT : MONEYLINE_REJECT_CENTS;

  if (diff >= rejectThreshold) {
    console.log(`FRESHNESS_REJECTED: pick "${pick.pick}" for ${pick.game} moved from ${oldVal} to ${newVal} (diff ${diff}) — past reject threshold, declining to publish.`);
    return { pick, rejected: true, note: `Line moved materially (${oldVal} → ${newVal})` };
  }
  if (diff >= annotateThreshold) {
    console.log(`FRESHNESS_ANNOTATED: pick "${pick.pick}" for ${pick.game} moved from ${oldVal} to ${newVal} (diff ${diff}) — annotating.`);
    return {
      pick: { ...pick, insight: `${pick.insight}\n\n*Note: line has moved since this research was completed — originally ${oldVal}, currently ${newVal}.*` },
      rejected: false,
      note: `Annotated for line movement (${oldVal} → ${newVal})`,
    };
  }
  return { pick, rejected: false, note: 'No material movement.' };
}

async function fetchLiveSlimGames() {
  const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds', { method: 'POST' });
  const oddsData = await oddsRes.json();
  return (oddsData.games || []).map(g => {
    const bm = g.bookmakers?.[0];
    const h2h = bm?.markets?.find(m => m.key === 'h2h');
    const spread = bm?.markets?.find(m => m.key === 'spreads');
    const total = bm?.markets?.find(m => m.key === 'totals');
    return {
      game: `${g.away_team} @ ${g.home_team}`,
      moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', '),
      spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
      total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
    };
  });
}

async function checkBatchStatus(batchId) {
  const response = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
  });
  return response.json();
}

async function fetchBatchResults(resultsUrl) {
  const response = await fetch(resultsUrl, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
  });
  const text = await response.text();
  // Batch results are JSONL — one JSON object per line. We only ever submit
  // a single request per batch, so we expect exactly one line.
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

async function cancelBatch(batchId) {
  await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/cancel`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
  });
}

// ── Phase 1 hardening: deterministic enforcement, not model discretion ──

// Eligibility gate: never trust that a mandatory fact was actually verified
// just because the model said so. This is the direct fix for the real
// incident where a pick was published despite the model's own insight
// admitting it didn't know the starting pitcher — that check existed in
// the prompt, but nothing stopped the model from proceeding anyway. Now
// it's enforced here, in code, not in the model's own judgment.
function checkEligibility(pick) {
  const elig = pick.eligibility;
  if (!elig) {
    return { eligible: false, reason: 'No eligibility object returned at all' };
  }
  if (elig.mandatory_participant_confirmed !== true) {
    return { eligible: false, reason: 'mandatory_participant_confirmed is not explicitly true' };
  }
  if (elig.data_confidence !== 'confirmed') {
    return { eligible: false, reason: `data_confidence is "${elig.data_confidence}", not "confirmed"` };
  }
  const names = (elig.confirmed_names || '').toLowerCase();
  if (!names.trim()) {
    return { eligible: false, reason: 'confirmed_names is empty despite claiming confirmation' };
  }
  for (const pattern of UNCERTAIN_NAME_PATTERNS) {
    if (names.includes(pattern)) {
      return { eligible: false, reason: `confirmed_names contains uncertainty language ("${pattern}") despite claiming confirmation` };
    }
  }
  return { eligible: true, reason: null };
}

// Entity-consistency check: the direct fix for the confirmed second incident
// (a rejected-alternative mention bled in a team/stat from a different,
// unrelated game). Real team names for TODAY's full slate are known in
// code (slim_games) — check that no pick's insight references a real team
// from today's slate that isn't actually part of that pick's own game or
// one of the other surviving picks (a legitimate same-day cross-reference).
function checkEntityConsistency(pick, allSlimGames, allSurvivingPicks) {
  const ownTeams = new Set(
    (pick.game || '').split(/ @ | vs /i).map(t => t.trim().toLowerCase()).filter(Boolean)
  );
  const allowedTeams = new Set(ownTeams);
  for (const other of allSurvivingPicks) {
    if (other === pick) continue;
    (other.game || '').split(/ @ | vs /i).forEach(t => allowedTeams.add(t.trim().toLowerCase()));
  }

  const insightLower = (pick.insight || '').toLowerCase();
  for (const g of allSlimGames) {
    const teamsInThisGame = (g.game || '').split(/ @ | vs /i).map(t => t.trim()).filter(Boolean);
    for (const team of teamsInThisGame) {
      const teamLower = team.toLowerCase();
      if (allowedTeams.has(teamLower)) continue; // belongs to this pick or another surviving pick — fine
      if (teamLower.length > 4 && insightLower.includes(teamLower)) {
        return { consistent: false, reason: `Insight mentions "${team}", a real team from today's slate not part of this pick's own game or any other selected pick` };
      }
    }
  }
  return { consistent: true, reason: null };
}

// Infer a rough bet-type bucket from pick text, for the correlation cap —
// same lightweight heuristic already used elsewhere in this pipeline.
function inferBetTypeBucket(pickText) {
  const t = (pickText || '').toLowerCase();
  if (/\b(over|under)\b/.test(t)) return 'total';
  if (/\bf5\b|first\s*5|1h\b|first\s*half/.test(t)) return 'alt_line';
  if (/[+-]\d/.test(t)) return 'spread';
  return 'moneyline';
}

// Dynamic selection: replaces "always take whatever the model returned" with
// a fixed, code-enforced score threshold and a correlation cap. The model no
// longer selects its own final 3 — every eligible, entity-consistent
// candidate is scored, and code picks the final list. Publishing fewer than
// 3 (even zero) is the correct outcome on a day the market doesn't offer it —
// the threshold is never lowered to hit a count.
function selectFinalPicks(candidates) {
  const eligible = candidates
    .filter(p => typeof p.score === 'number' && p.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const bucketCounts = {};
  for (const candidate of eligible) {
    if (selected.length >= MAX_DAILY_PICKS) break;
    const key = `${candidate.sport}::${inferBetTypeBucket(candidate.pick)}`;
    const currentCount = bucketCounts[key] || 0;
    if (currentCount >= MAX_SAME_SPORT_AND_TYPE) {
      console.log(`CORRELATION_CAP: skipping "${candidate.pick}" (score ${candidate.score}) — already have ${currentCount} picks in ${key}`);
      continue;
    }
    selected.push(candidate);
    bucketCounts[key] = currentCount + 1;
  }
  return selected;
}

async function processPendingBatches() {
  const { data: pendingJobs, error: fetchErr } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('status', 'submitted');

  if (fetchErr) throw fetchErr;
  if (!pendingJobs || pendingJobs.length === 0) {
    console.log('No pending batch jobs to check.');
    return;
  }

  for (const job of pendingJobs) {
    console.log(`Checking batch ${job.anthropic_batch_id} (job ${job.id}, date ${job.date})...`);
    const status = await checkBatchStatus(job.anthropic_batch_id);

    if (status.processing_status !== 'ended') {
      const now = new Date();
      const deadline = new Date(job.deadline_at);
      if (now >= deadline) {
        console.log(`ALERT: Batch ${job.anthropic_batch_id} missed its deadline (${job.deadline_at}) and is still ${status.processing_status}. Cancelling — no picks will be generated for ${job.date}.`);
        await cancelBatch(job.anthropic_batch_id);
        await supabase.from('batch_jobs').update({
          status: 'expired',
          notes: `Missed deadline ${job.deadline_at}, still ${status.processing_status} at cancel time. No picks generated this run.`,
        }).eq('id', job.id);
      } else {
        console.log(`Batch ${job.anthropic_batch_id} still ${status.processing_status}, deadline not yet reached (${job.deadline_at}). Will check again next poll.`);
      }
      continue;
    }

    // Batch ended — retrieve and process the result.
    try {
      const results = await fetchBatchResults(status.results_url);
      const result = results[0];

      if (result.result?.type !== 'succeeded') {
        console.log(`Batch ${job.anthropic_batch_id} ended but did not succeed: ${result.result?.type}. Marking failed, no picks written.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: `Batch result type: ${result.result?.type}`,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      const message = result.result.message;
      const searchCount = countSearches(message.content);
      const text = extractText(message.content);
      console.log(`Batch ${job.anthropic_batch_id} succeeded. stop_reason: ${message.stop_reason}, search count: ${searchCount}`);

      if (!text.trim() || searchCount < MIN_SEARCHES_REQUIRED) {
        console.log(`Batch ${job.anthropic_batch_id} completed with insufficient research (searches: ${searchCount}, min: ${MIN_SEARCHES_REQUIRED}) or no text. Refusing to write anything rather than risk a weak/ungrounded result.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: `Insufficient research after batch completion: ${searchCount} searches, text present: ${!!text.trim()}`,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      const parsed = cleanJson(text);
      if (!parsed.picks || parsed.picks.length === 0) {
        throw new Error('Parsed batch result has no picks array');
      }

      // Same deterministic game-verification gate as before, checked against
      // the ORIGINAL stored snapshot (slim_games from submission time) —
      // never trust a pick's "game" field just because the model said so.
      const realGameSet = new Set((job.slim_games || []).map(g => g.game));
      const gameVerifiedPicks = [];
      for (const p of parsed.picks) {
        if (realGameSet.has(p.game)) {
          gameVerifiedPicks.push(p);
        } else {
          console.log(`HALLUCINATED_GAME_REJECTED: pick "${p.pick}" for game "${p.game}" does not exist in the original odds feed — discarding.`);
        }
      }

      if (gameVerifiedPicks.length === 0) {
        console.log(`All picks from batch ${job.anthropic_batch_id} failed game verification. Refusing to write anything.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: 'All picks failed game verification against original odds snapshot.',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      // Eligibility gate — the direct code-level fix for the missing-starter
      // incident. A candidate whose mandatory participant confirmation
      // wasn't genuinely verified is disqualified here, unconditionally,
      // regardless of how strong the rest of its case reads.
      const eligiblePicks = [];
      for (const p of gameVerifiedPicks) {
        const { eligible, reason } = checkEligibility(p);
        if (eligible) {
          eligiblePicks.push(p);
        } else {
          console.log(`ELIGIBILITY_REJECTED: pick "${p.pick}" for "${p.game}" — ${reason}`);
        }
      }

      if (eligiblePicks.length === 0) {
        console.log(`All picks from batch ${job.anthropic_batch_id} failed the eligibility gate (no candidate had genuinely confirmed mandatory data). Refusing to write anything.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: 'All picks failed eligibility gate (mandatory participant confirmation not verified).',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      // Entity-consistency check — the direct fix for the confirmed
      // stat-bleed incident (a name/stat from an unrelated game leaking
      // into a different pick's text, including "alternatives considered").
      // Checked against every eligible candidate as the "surviving picks"
      // set, so legitimate same-day cross-references between candidates
      // aren't falsely flagged.
      const verifiedPicks = [];
      for (const p of eligiblePicks) {
        const { consistent, reason } = checkEntityConsistency(p, job.slim_games || [], eligiblePicks);
        if (consistent) {
          verifiedPicks.push(p);
        } else {
          console.log(`ENTITY_CONSISTENCY_REJECTED: pick "${p.pick}" for "${p.game}" — ${reason}`);
        }
      }

      if (verifiedPicks.length === 0) {
        console.log(`All picks from batch ${job.anthropic_batch_id} failed the entity-consistency check. Refusing to write anything.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: 'All picks failed entity-consistency check (unrelated team/stat bleed detected).',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      // Publish-time freshness check — compare against a FRESH live odds
      // fetch taken right now, separate from and in addition to the
      // game-verification gate above (which checks correctness against the
      // original snapshot, not live freshness).
      let liveSlimGames = [];
      try {
        liveSlimGames = await fetchLiveSlimGames();
      } catch (e) {
        console.log(`Could not fetch live odds for freshness check (${e.message}) — proceeding without freshness annotation this run.`);
      }

      const freshnessResults = verifiedPicks.map(p =>
        liveSlimGames.length > 0
          ? checkFreshnessAndAnnotate(p, job.slim_games || [], liveSlimGames)
          : { pick: p, rejected: false, note: 'Freshness check skipped (live odds unavailable).' }
      );

      const finalPicks = freshnessResults
        .filter(r => !r.rejected)
        .map(r => r.pick);

      freshnessResults.forEach(r => {
        if (r.rejected) console.log(`FRESHNESS_REJECTED pick removed from publish: ${r.note}`);
      });

      if (finalPicks.length === 0) {
        console.log(`All picks from batch ${job.anthropic_batch_id} were rejected at the freshness check. Refusing to write anything.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: 'All picks rejected at publish-time freshness check.',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      // Dynamic selection — the model no longer picks its own final 3. Every
      // eligible, entity-consistent, fresh candidate has an honest 1-10
      // score; code applies a fixed threshold (never adjusted based on how
      // many candidates happen to clear it) and a correlation cap, then
      // takes up to MAX_DAILY_PICKS. Publishing fewer than 3 — including
      // zero — is the correct, intended outcome on a day the market doesn't
      // offer enough real edges, not a failure state.
      const selectedPicks = selectFinalPicks(finalPicks);
      console.log(`Dynamic selection: ${finalPicks.length} candidate(s) survived all gates, ${selectedPicks.length} cleared the score threshold (${MIN_SCORE_THRESHOLD}) and correlation cap.`);

      if (selectedPicks.length === 0) {
        console.log(`No candidates from batch ${job.anthropic_batch_id} cleared the minimum score threshold of ${MIN_SCORE_THRESHOLD}. This is a valid outcome — publishing zero picks rather than lowering the bar.`);
        await supabase.from('batch_jobs').update({
          status: 'completed',
          notes: `No candidates cleared the ${MIN_SCORE_THRESHOLD} score threshold today. 0 picks published — this is expected behavior on a weak slate, not an error.`,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      const correctedPicks = selectedPicks.map(p => normalizeSpreadSign(p, job.spread_lookup || {}));

      const rows = correctedPicks.map(p => ({
        date: job.date,
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

      // Mark any existing active picks for this date inactive first (mirrors
      // the dedupe behavior generate-picks used to do at the start of a run).
      await supabase.from('daily_picks').update({ status: 'inactive' }).eq('date', job.date);

      const { error: insertErr } = await supabase.from('daily_picks').insert(rows);
      if (insertErr) throw insertErr;

      await supabase.from('batch_jobs').update({
        status: 'completed',
        notes: `Wrote ${rows.length} picks. ${freshnessResults.filter(r => r.note?.includes('Annotated')).length} annotated for line movement.`,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      console.log(`Successfully wrote ${rows.length} picks for ${job.date} from batch ${job.anthropic_batch_id}.`);
    } catch (err) {
      console.error(`Error processing completed batch ${job.anthropic_batch_id}:`, err.message);
      await supabase.from('batch_jobs').update({
        status: 'failed',
        notes: `Error during processing: ${err.message}`,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  if (authHeader !== 'Bearer betcierge_cron_2026_v3' && !cronHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await processPendingBatches();
    return Response.json({ success: true });
  } catch (e) {
    console.error('poll-batch-picks error:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
