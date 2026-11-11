// The free plan allows 10,000 Workers AI neurons a day across the whole site.
// A message costs roughly 8 to 11 neurons, so a run of 60 messages is about 600. Twelve runs a day leaves
// headroom for the boss level's judge calls and for testing, which uses the same allowance.

export const RUNS_PER_DAY = 12;
/** Runs one visitor (one IP address) can start in a day, so a single person can't empty the pool. */
export const RUNS_PER_VISITOR = 3;
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

/**
 * Counts a run start against one visitor for the day. One statement, like `reserveRun`.
 * Returns false when that visitor has already started RUNS_PER_VISITOR runs today.
 */
export async function claimVisitorRun(db: D1Database, day: string, visitor: string): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO run_starts (date, visitor, runs) VALUES (?1, ?2, 1)
       ON CONFLICT (date, visitor) DO UPDATE SET runs = runs + 1 WHERE runs < ?3
       RETURNING runs`,
    )
    .bind(day, visitor, RUNS_PER_VISITOR)
    .first();
  return row !== null;
}

/** Gives a visitor's run start back when the pool turned out to be full. */
export async function releaseVisitorRun(db: D1Database, day: string, visitor: string) {
  await db.prepare('UPDATE run_starts SET runs = runs - 1 WHERE date = ? AND visitor = ? AND runs > 0').bind(day, visitor).run();
}

export async function runsLeft(db: D1Database, day = utcDay()): Promise<number> {
  const row = await db.prepare('SELECT runs_reserved FROM days WHERE date = ?').bind(day).first<{ runs_reserved: number }>();
  return RUNS_PER_DAY - (row?.runs_reserved ?? 0);
}
