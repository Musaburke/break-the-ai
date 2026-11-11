import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { randomId } from '../../engine/crypto';
import { currentPlayer } from '../../engine/player';
import { buildReport, type ReportSummary } from '../../engine/report';
import { levels } from '../../levels';

export const prerender = false;

// Creates the player's public report once every released level is solved. Asking again returns the same one.
// A report made before a level shipped is brought up to date in place once that level is solved too, so a
// link already shared keeps working and shows the whole contract.
export const POST: APIRoute = async ({ cookies }) => {
  const player = await currentPlayer(cookies, env.SECRET_KEY, env.DB);
  if (!player) return Response.json({ error: 'no-player' }, { status: 401 });

  const existing = await env.DB.prepare('SELECT id, summary_json FROM reports WHERE player_id = ?')
    .bind(player.id)
    .first<{ id: string; summary_json: string }>();
  const covered = existing ? (JSON.parse(existing.summary_json) as ReportSummary).findings.length : 0;
  if (existing && covered >= levels.length) return Response.json({ id: existing.id });

  const { results } = await env.DB.prepare('SELECT level, messages_used, hints_used, clue_seen, solved_at FROM progress WHERE player_id = ?')
    .bind(player.id)
    .all<{ level: number; messages_used: number; hints_used: number; clue_seen: number; solved_at: string | null }>();
  const summary = buildReport(levels, results);
  if (!summary) return existing ? Response.json({ id: existing.id }) : Response.json({ error: 'unfinished' }, { status: 409 });
  if (existing) {
    await env.DB.prepare('UPDATE reports SET summary_json = ? WHERE id = ?').bind(JSON.stringify(summary), existing.id).run();
    return Response.json({ id: existing.id });
  }

  // Random and unguessable, never sequential, so reports can't be listed by counting.
  const id = randomId(9);
  await env.DB.prepare('INSERT INTO reports (id, player_id, created_at, summary_json) VALUES (?, ?, ?, ?)')
    .bind(id, player.id, new Date().toISOString(), JSON.stringify(summary))
    .run();
  return Response.json({ id });
};
