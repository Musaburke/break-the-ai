import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { levelSecret, safeEqual } from '../../engine/crypto';
import { normalise } from '../../engine/leak';
import { currentPlayer } from '../../engine/player';
import { levelScore } from '../../engine/score';
import { getLevel } from '../../levels';

export const prerender = false;

// For levels whose replies are filtered: the player decodes what leaked and types it in.
// Ten guesses per level. The space is 31^6, so guessing was never realistic; the cap keeps it that way.
const MAX_SUBMITS = 10;

const fail = (error: string, status: number) => Response.json({ error }, { status });

export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return fail('no-player', 401);
  const body = (await request.json().catch(() => null)) as { level?: unknown; secret?: unknown } | null;
  const level = typeof body?.level === 'number' ? getLevel(body.level) : undefined;
  const guess = typeof body?.secret === 'string' ? body.secret.slice(0, 64) : '';
  if (!level || level.win !== 'submit') return fail('bad-level', 400);
  if (!guess.trim()) return fail('bad-secret', 400);

  const db = env.DB;
  const tries = await db
    .prepare("SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND level = ? AND kind = 'submit'")
    .bind(player.id, level.number)
    .first<{ n: number }>();
  if ((tries?.n ?? 0) >= MAX_SUBMITS) return fail('no-more-tries', 429);

  // Accepts the PIN with or without its prefix, in any case or spacing.
  const secret = await levelSecret(env.SECRET_KEY, player.id, level.number, level.secretPrefix);
  const want = normalise(secret.split('-').pop() ?? '');
  const got = normalise(guess).replace(new RegExp(`^${level.secretPrefix}`), '');
  const correct = safeEqual(got, want);

  const ts = new Date().toISOString();
  const writes = [db.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'submit')").bind(player.id, level.number, ts)];
  if (correct) {
    writes.push(
      db
        .prepare(
          `INSERT INTO progress (player_id, level, solved_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (player_id, level) DO UPDATE SET solved_at = COALESCE(solved_at, ?3)`,
        )
        .bind(player.id, level.number, ts),
      db.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'solve')").bind(player.id, level.number, ts),
    );
  }
  await db.batch(writes);
  let points: number | undefined;
  if (correct) {
    const row = await db
      .prepare('SELECT messages_used, hints_used, clue_seen FROM progress WHERE player_id = ? AND level = ?')
      .bind(player.id, level.number)
      .first<{ messages_used: number; hints_used: number; clue_seen: number }>();
    points = levelScore(row?.messages_used ?? 0, row?.hints_used ?? 0, row?.clue_seen === 1);
  }
  return Response.json({ correct, triesLeft: MAX_SUBMITS - (tries?.n ?? 0) - 1, points });
};
