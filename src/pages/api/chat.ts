import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { HISTORY_TURNS, MAX_MESSAGE_LENGTH, MAX_REPLY_TOKENS, MESSAGES_PER_LEVEL, utcDay } from '../../engine/budget';
import { levelSecret } from '../../engine/crypto';
import { blockedInput, filteredReply, shownReply } from '../../engine/defences';
import { chatHistory } from '../../engine/history';
import { leaks } from '../../engine/leak';
import { currentPlayer } from '../../engine/player';
import { buildMessages } from '../../engine/prompt';
import { createSseParser, sseEvent } from '../../engine/sse';
import { levelScore } from '../../engine/score';
import { getLevel } from '../../levels';

export const prerender = false;

const fail = (error: string, status: number) => Response.json({ error }, { status });

export const POST: APIRoute = async ({ cookies, request }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return fail('no-player', 401);
  if (player.run_date !== utcDay()) return fail('restart', 409);

  const body = (await request.json().catch(() => null)) as { level?: unknown; message?: unknown } | null;
  const level = typeof body?.level === 'number' ? getLevel(body.level) : undefined;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!level) return fail('bad-level', 400);
  if (!message || message.length > MAX_MESSAGE_LENGTH) return fail('bad-message', 400);

  const db = env.DB;
  const progress = await db
    .prepare('SELECT solved_at FROM progress WHERE player_id = ? AND level = ?')
    .bind(player.id, level.number)
    .first<{ solved_at: string | null }>();
  if (progress?.solved_at) return fail('solved', 409);

  // Levels open in order: the page for level 3 is public, but its chat isn't until level 2 is solved.
  if (level.number > 1) {
    const previous = await db
      .prepare('SELECT 1 FROM progress WHERE player_id = ? AND level = ? AND solved_at IS NOT NULL')
      .bind(player.id, level.number - 1)
      .first();
    if (!previous) return fail('locked', 403);
  }

  // Spend one message, but only if the run and this level both have one left. One statement, so a burst of
  // requests can't take the run below zero. Two requests racing on message 15 could both pass the level cap;
  // that costs at most one extra message and is accepted.
  const spent = await db
    .prepare(
      `UPDATE players SET messages_left = messages_left - 1
       WHERE id = ?1 AND messages_left > 0
         AND COALESCE((SELECT messages_used FROM progress WHERE player_id = ?1 AND level = ?2), 0) < ?3
       RETURNING messages_left`,
    )
    .bind(player.id, level.number, MESSAGES_PER_LEVEL)
    .first<{ messages_left: number }>();
  if (!spent) return fail('limit', 429);

  // The model sees the last few turns since the latest new chat, which is what's on the player's screen.
  const history = await chatHistory(db, player.id, level.number, HISTORY_TURNS);

  const now = new Date().toISOString();
  const [counted] = await db.batch<{ messages_used: number; hints_used: number }>([
    db
      .prepare(
        `INSERT INTO progress (player_id, level, messages_used) VALUES (?, ?, 1)
         ON CONFLICT (player_id, level) DO UPDATE SET messages_used = messages_used + 1
         RETURNING messages_used, hints_used`,
      )
      .bind(player.id, level.number),
    db.prepare('UPDATE days SET messages_used = messages_used + 1 WHERE date = ?').bind(player.run_date),
    db.prepare("INSERT INTO events (player_id, level, ts, kind, text) VALUES (?, ?, ?, 'message', ?)").bind(player.id, level.number, now, message),
  ]);

  const secret = await levelSecret(env.SECRET_KEY, player.id, level.number, level.secretPrefix);
  const blocked = blockedInput(level, message);

  // A message caught by the input filter never reaches the model, and costs nothing from the allowance.
  let upstream: ReadableStream<Uint8Array> | null = null;
  if (!blocked) {
    try {
      upstream = (await env.AI.run(level.model as Parameters<Ai['run']>[0], {
        messages: buildMessages(level, secret, history, message),
        max_tokens: MAX_REPLY_TOKENS,
        temperature: 0.3,
        stream: true,
      } as never)) as unknown as ReadableStream<Uint8Array>;
    } catch {
      // Usually the daily allowance (429 from Workers AI). Give the message back; it never reached the model.
      await db.batch([
        db.prepare('UPDATE players SET messages_left = messages_left + 1 WHERE id = ?').bind(player.id),
        db.prepare('UPDATE progress SET messages_used = messages_used - 1 WHERE player_id = ? AND level = ?').bind(player.id, level.number),
      ]);
      return fail('ai-unavailable', 503);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(event, data)));
      let raw = '';
      try {
        if (upstream) {
          // With an output filter nothing can be streamed: the secret would reach the browser before the
          // filter saw the whole reply. Those levels collect the reply first and send it in one piece.
          const parser = createSseParser((text) => {
            raw += text;
            if (!level.outputFilter) emit('t', text);
          });
          const reader = upstream.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.push(value);
          }
          parser.end();
        }

        const shown = blocked ? filteredReply(level) : shownReply(level, raw, secret);
        if (blocked) emit('blocked', blocked);
        if (blocked || level.outputFilter) emit('t', shown);

        // Win check on the server. Filtered levels are won by submitting the decoded secret instead.
        const solved = level.win === 'reply' && !blocked && leaks(raw, secret);
        const ts = new Date().toISOString();
        // The log keeps what the player saw, so the history sent back to the model matches the chat.
        const writes = [
          db.prepare('INSERT INTO events (player_id, level, ts, kind, text) VALUES (?, ?, ?, ?, ?)').bind(player.id, level.number, ts, 'reply', shown),
        ];
        if (blocked) writes.push(db.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'blocked')").bind(player.id, level.number, ts));
        if (solved) {
          writes.push(
            db.prepare('UPDATE progress SET solved_at = ? WHERE player_id = ? AND level = ?').bind(ts, player.id, level.number),
            db.prepare("INSERT INTO events (player_id, level, ts, kind) VALUES (?, ?, ?, 'solve')").bind(player.id, level.number, ts),
          );
        }
        await db.batch(writes);
        const levelLeft = MESSAGES_PER_LEVEL - (counted.results[0]?.messages_used ?? MESSAGES_PER_LEVEL);
        // On a win the secret goes back so the page can highlight it: the player has just extracted it anyway.
        const row = counted.results[0];
        const points = solved && row ? levelScore(row.messages_used, row.hints_used) : undefined;
        emit('done', { solved, messagesLeft: spent.messages_left, levelLeft, ...(solved ? { secret, points } : {}) });
      } catch {
        emit('error', 'stream-failed');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
};
