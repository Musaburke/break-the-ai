import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MESSAGES_PER_LEVEL } from '../../engine/budget';
import { chatHistory } from '../../engine/history';
import { currentPlayer } from '../../engine/player';
import { getLevel } from '../../levels';

export const prerender = false;

/** The conversation so far on a level, so leaving and coming back doesn't lose it. */
export const GET: APIRoute = async ({ cookies, url }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });
  const level = getLevel(Number(url.searchParams.get('level')));
  if (!level) return Response.json({ error: 'bad-level' }, { status: 400 });
  // Every turn a level allows: a message and a reply for each.
  return Response.json({ turns: await chatHistory(env.DB, player.id, level.number, MESSAGES_PER_LEVEL * 2) });
};

// Starts the conversation on a level over: the model forgets earlier turns, so one refusal doesn't
// colour the rest. Messages used, hints and points are untouched, so it's never a way to farm score.
export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { level?: unknown } | null;
  const level = typeof body?.level === 'number' ? getLevel(body.level) : undefined;
  if (!level) return Response.json({ error: 'bad-level' }, { status: 400 });

  await env.DB.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'reset')")
    .bind(player.id, level.number, new Date().toISOString())
    .run();
  return Response.json({ ok: true });
};
