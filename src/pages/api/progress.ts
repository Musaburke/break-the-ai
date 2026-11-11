import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { currentPlayer } from '../../engine/player';
import { levelScore } from '../../engine/score';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });
  const { results } = await env.DB.prepare(
    'SELECT level, messages_used AS messagesUsed, hints_used AS hintsUsed, solved_at IS NOT NULL AS solved FROM progress WHERE player_id = ?',
  )
    .bind(player.id)
    .all<{ level: number; messagesUsed: number; hintsUsed: number; solved: number }>();
  const levels = results.map((l) => ({ ...l, points: l.solved ? levelScore(l.messagesUsed, l.hintsUsed, player.mode === 'easy') : 0 }));
  return Response.json({ messagesLeft: player.messages_left, mode: player.mode, score: levels.reduce((sum, l) => sum + l.points, 0), levels });
};
