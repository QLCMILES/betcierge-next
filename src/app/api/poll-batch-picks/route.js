import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60; // this just polls status and, on completion, does one parse+validate+write pass — should be fast
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_SEARCHES_REQUIRED = 15;

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
      const verifiedPicks = [];
      for (const p of parsed.picks) {
        if (realGameSet.has(p.game)) {
          verifiedPicks.push(p);
        } else {
          console.log(`HALLUCINATED_GAME_REJECTED: pick "${p.pick}" for game "${p.game}" does not exist in the original odds feed — discarding.`);
        }
      }

      if (verifiedPicks.length === 0) {
        console.log(`All picks from batch ${job.anthropic_batch_id} failed game verification. Refusing to write anything.`);
        await supabase.from('batch_jobs').update({
          status: 'failed',
          notes: 'All picks failed game verification against original odds snapshot.',
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

      const correctedPicks = finalPicks.map(p => normalizeSpreadSign(p, job.spread_lookup || {}));

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
