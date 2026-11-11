import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MESSAGES_PER_RUN, claimVisitorRun, releaseVisitorRun, reserveRun, utcDay } from '../../engine/budget';
import { randomId, visitorId } from '../../engine/crypto';
import { currentPlayer, setPlayerCookie } from '../../engine/player';

export const prerender = false;

// Starts or resumes a run. A run is reserved from today's pool before the player types anything,
// so nobody is cut off halfway: if the day can't cover a whole run, they're told now.
const LOOPBACK = new Set(['127.0.0.1', '::1']);

// Reserves a run from today's pool, but no more than RUNS_PER_VISITOR per IP address a day.
// Without that cap, a dozen requests from one machine would lock everyone else out until midnight.
async function reserve(request: Request, today: string): Promise<'ok' | 'full' | 'visitor-limit'> {
  // Cloudflare always sets this header in production. Local dev reports loopback (or nothing), and playtests
  // start many runs, so loopback isn't counted. Production never sees a loopback address.
  const header = request.headers.get('CF-Connecting-IP');
  const ip = header && !LOOPBACK.has(header) ? header : import.meta.env.DEV ? null : (header ?? 'unknown');
  const visitor = ip ? await visitorId(env.SECRET_KEY, today, ip) : null;
  if (visitor && !(await claimVisitorRun(env.DB, today, visitor))) return 'visitor-limit';
  if (await reserveRun(env.DB, today)) return 'ok';
  if (visitor) await releaseVisitorRun(env.DB, today, visitor);
  return 'full';
}

export const POST: APIRoute = async ({ cookies, url, request }) => {
  const today = utcDay();
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);

  if (player) {
    // Same day, or nothing left to play: nothing to reserve.
    if (player.run_date === today || player.messages_left === 0) {
      return Response.json({ messagesLeft: player.messages_left });
    }
    // Back on a later day with messages left: progress is kept, but today's pool must cover them.
    const reserved = await reserve(request, today);
    if (reserved !== 'ok') return Response.json({ error: reserved }, { status: reserved === 'full' ? 409 : 429 });
    await env.DB.prepare('UPDATE players SET run_date = ? WHERE id = ?').bind(today, player.id).run();
    return Response.json({ messagesLeft: player.messages_left });
  }

  const reserved = await reserve(request, today);
  if (reserved !== 'ok') return Response.json({ error: reserved }, { status: reserved === 'full' ? 409 : 429 });
  const id = randomId();
  await env.DB.prepare('INSERT INTO players (id, created_at, run_date, messages_left) VALUES (?, ?, ?, ?)')
    .bind(id, new Date().toISOString(), today, MESSAGES_PER_RUN)
    .run();
  await setPlayerCookie(cookies, env.SECRET_KEY, id, url.protocol === 'https:');
  return Response.json({ messagesLeft: MESSAGES_PER_RUN });
};
