// The free plan allows 10,000 Workers AI neurons a day across the whole site.
// A chat message costs roughly 8 to 11 neurons. A level 5 message can make two model calls (the tool call,
// then the answer) with a longer prompt, so it's estimated at about 24. A run is 4 levels × 15 messages at
// about 10, plus 15 at about 24: roughly 960 neurons. Eight runs a day is about 7,700, which leaves headroom
// for testing, which uses the same allowance. tests/budget.test.ts fails if these numbers stop fitting.
// The estimates are from the pricing page, not measured; re-check them once level 5 is live.

export const RUNS_PER_DAY = 8;
/** Runs one visitor (one IP address) can start in a day, so a single person can't empty the pool. */
export const RUNS_PER_VISITOR = 3;
export const MESSAGES_PER_RUN = 75;
export const MESSAGES_PER_LEVEL = 15;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_REPLY_TOKENS = 150;
/** Previous turns sent with each message. Older turns are dropped to keep the cost per message flat. */
export const HISTORY_TURNS = 6;
/** Largest API request body. The longest legal one is an inbox email: 660 characters, up to 4 bytes each, plus JSON. */
export const MAX_BODY_BYTES = 8 * 1024;

/** Estimated neurons per message, from the Workers AI pricing page (see the note at the top). */
export const NEURONS_PER_CHAT_MESSAGE = 10;
export const NEURONS_PER_AGENT_MESSAGE = 24;
/** The free daily allowance, and the share of it the game plans to use. The rest is headroom. */
export const DAILY_NEURONS = 10_000;
export const PLANNED_NEURONS = 8_000;

/**
 * True when a request says its body is over MAX_BODY_BYTES. Content-Length counts bytes, and the runtime
 * won't deliver more bytes than it states. A body sent without Content-Length (chunked) isn't caught here;
 * the routes' own length checks still apply to it.
 */
export function bodyTooBig(headers: Headers): boolean {
  return Number(headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES;
}

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
