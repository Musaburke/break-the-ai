// The free plan allows 10,000 Workers AI neurons a day across the whole site.
// A message costs roughly 8 to 11 neurons, so a run of 60 messages is about 600. Twelve runs a day leaves
// headroom for the boss level's judge calls and for testing, which uses the same allowance.

export const RUNS_PER_DAY = 12;
export const MESSAGES_PER_RUN = 60;
export const MESSAGES_PER_LEVEL = 15;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_REPLY_TOKENS = 150;
/** Previous turns sent with each message. Older turns are dropped to keep the cost per message flat. */
export const HISTORY_TURNS = 6;

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Reserves one whole run from today's pool. One statement, so two players starting at the same moment
 * can never push the day past RUNS_PER_DAY. Returns false when the day is full.
 */
export async function reserveRun(db: D1Database, day = utcDay()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO days (date, runs_reserved) VALUES (?1, 1)
       ON CONFLICT (date) DO UPDATE SET runs_reserved = runs_reserved + 1 WHERE runs_reserved < ?2
       RETURNING runs_reserved`,
    )
    .bind(day, RUNS_PER_DAY)
    .first();
  return row !== null;
}

export async function runsLeft(db: D1Database, day = utcDay()): Promise<number> {
  const row = await db.prepare('SELECT runs_reserved FROM days WHERE date = ?').bind(day).first<{ runs_reserved: number }>();
  return RUNS_PER_DAY - (row?.runs_reserved ?? 0);
}
