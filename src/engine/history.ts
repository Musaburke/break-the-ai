import type { Turn } from './types';

/**
 * A player's conversation on one level since their latest new chat (a 'reset' event), oldest first,
 * as they saw it. Read from the server's own log, never from the browser, so past replies can't be forged.
 */
export async function chatHistory(db: D1Database, playerId: string, level: number, limit: number): Promise<Turn[]> {
  const { results } = await db
    .prepare(
      `SELECT kind, text FROM events WHERE player_id = ?1 AND level = ?2 AND kind IN ('message', 'reply') AND text IS NOT NULL
         AND id > COALESCE((SELECT MAX(id) FROM events WHERE player_id = ?1 AND level = ?2 AND kind = 'reset'), 0)
       ORDER BY id DESC LIMIT ?3`,
    )
    .bind(playerId, level, limit)
    .all<{ kind: string; text: string }>();
  return results.reverse().map((e) => ({ role: e.kind === 'message' ? 'user' : 'assistant', content: e.text }));
}
