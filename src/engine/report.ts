import { levelScore } from './score';
import type { Level } from './types';

export type ReportSummary = {
  date: string;
  findings: { level: number; product: string; owasp: string[]; messages: number; hints: number; clue: boolean; points: number }[];
  totalMessages: number;
  totalHints: number;
  score: number;
  /** Levels where the clue was shown. Missing on reports made before clues existed. */
  totalClues?: number;
};

type Row = { level: number; messages_used: number; hints_used: number; clue_seen?: number; solved_at: string | null };

/**
 * The public pentest report. Built only from the game's own data: nothing the player typed appears in it,
 * so there is nothing to moderate. Returns null until every released level is solved.
 */
export function buildReport(levels: Level[], rows: Row[], now = new Date()): ReportSummary | null {
  const findings = [];
  for (const level of levels) {
    const row = rows.find((r) => r.level === level.number);
    if (!row?.solved_at) return null;
    findings.push({
      level: level.number,
      product: level.product,
      owasp: level.debrief.owasp,
      messages: row.messages_used,
      hints: row.hints_used,
      clue: row.clue_seen === 1,
      points: levelScore(row.messages_used, row.hints_used, row.clue_seen === 1),
    });
  }
  return {
    date: now.toISOString().slice(0, 10),
    findings,
    totalMessages: findings.reduce((sum, f) => sum + f.messages, 0),
    totalHints: findings.reduce((sum, f) => sum + f.hints, 0),
    score: findings.reduce((sum, f) => sum + f.points, 0),
    totalClues: findings.filter((f) => f.clue).length,
  };
}
