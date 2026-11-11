import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { randomId } from '../../engine/crypto';
import { currentPlayer } from '../../engine/player';
import { buildReport } from '../../engine/report';
import { levels } from '../../levels';

export const prerender = false;

// Creates the player's public report once every released level is solved. Asking again returns the same one.
export const POST: APIRoute = async ({ cookies }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });

  const existing = await env.DB.prepare('SELECT id FROM reports WHERE player_id = ?').bind(player.id).first<{ id: string }>();
  if (existing) return Response.json({ id: existing.id });

  const { results } = await env.DB.prepare('SELECT level, messages_used, hints_used, solved_at FROM progress WHERE player_id = ?')
    .bind(player.id)
    .all<{ level: number; messages_used: number; hints_used: number; solved_at: string | null }>();
  const summary = buildReport(levels, results);
  if (!summary) return Response.json({ error: 'unfinished' }, { status: 409 });

  // Random and unguessable, never sequential, so reports can't be listed by counting.
  const id = randomId(9);
  await env.DB.prepare('INSERT INTO reports (id, player_id, created_at, summary_json) VALUES (?, ?, ?, ?)')
    .bind(id, player.id, new Date().toISOString(), JSON.stringify(summary))
    .run();
  return Response.json({ id });
};
