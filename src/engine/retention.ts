// What players type is kept for 30 days (the home page says so), then the text is wiped.
// The event rows stay, without text, so the counts behind scores and reports still add up.
export const TEXT_DAYS = 30;

export async function pruneOldData(db: D1Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - TEXT_DAYS * 86_400_000).toISOString();
  const yesterday = now.toISOString().slice(0, 10);
  await db.batch([
    db.prepare('UPDATE events SET text = NULL WHERE ts < ? AND text IS NOT NULL').bind(cutoff),
    // Run-start counters per visitor only matter for the day they were made.
    db.prepare('DELETE FROM run_starts WHERE date < ?').bind(yesterday),
  ]);
}
