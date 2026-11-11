import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { currentPlayer } from '../../engine/player';
import { getLevel } from '../../levels';

export const prerender = false;

// Hints are served by the server, not shipped in the page, so the count in the debrief and report is real.
// They don't cost messages: they're the difficulty dial, not a penalty.

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Hints already revealed for a level, so a reload shows them again. */
export const GET: APIRoute = async ({ cookies, url }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return fail('no-player', 401);
  const level = getLevel(Number(url.searchParams.get('level')));
  if (!level) return fail('bad-level', 400);
  const row = await env.DB.prepare('SELECT messages_used, hints_used, clue_seen FROM progress WHERE player_id = ? AND level = ?')
    .bind(player.id, level.number)
    .first<{ messages_used: number; hints_used: number; clue_seen: number }>();
  // The clue never ships in the page. It's sent once it's been shown, or now if the player is on Easy,
  // and showing it is recorded first, so the level costs CLUE_COST from then on. On Easy it only shows by
  // itself on a level not yet started: on one already started (likely on Normal) the player chooses.
  let clue = row?.clue_seen === 1;
  const started = (row?.messages_used ?? 0) > 0 || (row?.hints_used ?? 0) > 0;
  if (!clue && player.mode === 'easy' && !started) clue = await showClue(player.id, level.number);
  return Response.json({ hints: level.hints.slice(0, row?.hints_used ?? 0), ...(clue ? { clue: level.clue } : {}) });
};

/**
 * Records that a level's clue has been shown, and says whether it may be. Never on a locked level (nothing
 * to play yet) and never charged once a level is solved, so a finished score can't drop. Once set it stays set.
 */
async function showClue(playerId: string, level: number): Promise<boolean> {
  if (level > 1) {
    const previous = await env.DB.prepare('SELECT 1 FROM progress WHERE player_id = ? AND level = ? AND solved_at IS NOT NULL')
      .bind(playerId, level - 1)
      .first();
    if (!previous) return false;
  }
  await env.DB.prepare(
    `INSERT INTO progress (player_id, level, clue_seen) VALUES (?, ?, 1)
     ON CONFLICT (player_id, level) DO UPDATE SET clue_seen = 1 WHERE solved_at IS NULL`,
  )
    .bind(playerId, level)
    .run();
  return true;
}

/** Reveals the next hint tier, up to three, or with `clue: true` the level's clue. */
export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return fail('no-player', 401);
  const body = (await request.json().catch(() => null)) as { level?: unknown; clue?: unknown } | null;
  const level = typeof body?.level === 'number' ? getLevel(body.level) : undefined;
  if (!level) return fail('bad-level', 400);

  // On Normal the clue is one button away, priced like Easy.
  if (body?.clue === true) {
    if (!(await showClue(player.id, level.number))) return fail('locked', 403);
    return Response.json({ clue: level.clue });
  }

  const row = await env.DB.prepare(
    `INSERT INTO progress (player_id, level, hints_used) VALUES (?1, ?2, 1)
     ON CONFLICT (player_id, level) DO UPDATE SET hints_used = hints_used + 1 WHERE hints_used < ?3
     RETURNING hints_used`,
  )
    .bind(player.id, level.number, level.hints.length)
    .first<{ hints_used: number }>();
  if (!row) return fail('no-more-hints', 409);

  await env.DB.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'hint')")
    .bind(player.id, level.number, new Date().toISOString())
    .run();
  return Response.json({ hints: level.hints.slice(0, row.hints_used) });
};
