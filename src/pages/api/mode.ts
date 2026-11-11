import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { currentPlayer } from '../../engine/player';

export const prerender = false;

// Changes difficulty mid-run. It only decides whether clues show up by themselves: a clue already seen
// still costs its level, so switching back to Normal never refunds anything.
export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  if (body?.mode !== 'easy' && body?.mode !== 'normal') return Response.json({ error: 'bad-mode' }, { status: 400 });
  await env.DB.prepare('UPDATE players SET mode = ? WHERE id = ?').bind(body.mode, player.id).run();
  return Response.json({ mode: body.mode });
};
