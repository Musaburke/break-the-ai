import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MESSAGES_PER_RUN, reserveRun, utcDay } from '../../engine/budget';
import { randomId } from '../../engine/crypto';
import { currentPlayer, setPlayerCookie } from '../../engine/player';

export const prerender = false;

// Starts or resumes a run. A run is reserved from today's pool before the player types anything,
// so nobody is cut off halfway: if the day can't cover a whole run, they're told now.
export const POST: APIRoute = async ({ cookies, url }) => {
  const today = utcDay();
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);

  if (player) {
    // Same day, or nothing left to play: nothing to reserve.
    if (player.run_date === today || player.messages_left === 0) {
      return Response.json({ messagesLeft: player.messages_left });
    }
    // Back on a later day with messages left: progress is kept, but today's pool must cover them.
    if (!(await reserveRun(env.DB, today))) return Response.json({ error: 'full' }, { status: 409 });
    await env.DB.prepare('UPDATE players SET run_date = ? WHERE id = ?').bind(today, player.id).run();
    return Response.json({ messagesLeft: player.messages_left });
  }

  if (!(await reserveRun(env.DB, today))) return Response.json({ error: 'full' }, { status: 409 });
  const id = randomId();
  await env.DB.prepare('INSERT INTO players (id, created_at, run_date, messages_left) VALUES (?, ?, ?, ?)')
    .bind(id, new Date().toISOString(), today, MESSAGES_PER_RUN)
    .run();
  await setPlayerCookie(cookies, env.SECRET_KEY, id, url.protocol === 'https:');
  return Response.json({ messagesLeft: MESSAGES_PER_RUN });
};
