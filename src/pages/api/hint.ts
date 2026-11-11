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
  const row = await env.DB.prepare('SELECT hints_used FROM progress WHERE player_id = ? AND level = ?')
    .bind(player.id, level.number)
    .first<{ hints_used: number }>();
  // The clue only ever leaves the server for an Easy run, so it can't be read from a Normal page's source.
  return Response.json({ hints: level.hints.slice(0, row?.hints_used ?? 0), ...(player.mode === 'easy' ? { clue: level.clue } : {}) });
};

/** Reveals the next hint tier, up to three. */
export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return fail('no-player', 401);
  const body = (await request.json().catch(() => null)) as { level?: unknown } | null;
  const level = typeof body?.level === 'number' ? getLevel(body.level) : undefined;
  if (!level) return fail('bad-level', 400);

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
