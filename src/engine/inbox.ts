import type { InboxEmail, Level, PlayerEmail } from './types';

export const MAX_FROM_LENGTH = 60;
export const MAX_SUBJECT_LENGTH = 100;

/** The player's email from a request body, trimmed, or null when a field is missing or too long. */
export function readEmail(value: unknown, maxBody: number): PlayerEmail | null {
  if (!value || typeof value !== 'object') return null;
  const field = (key: string, max: number) => {
    const v = (value as Record<string, unknown>)[key];
    const text = typeof v === 'string' ? v.trim() : '';
    return text && text.length <= max ? text : null;
  };
  const from = field('from', MAX_FROM_LENGTH);
  const subject = field('subject', MAX_SUBJECT_LENGTH);
  const body = field('body', maxBody);
  return from && subject && body ? { from, subject, body } : null;
}

/**
 * One email as the summariser sees it. The tags are the level's defence ("spotlighting"), and the
 * player's text goes in unescaped on purpose: a tag is only more text, so closing it yourself works.
 */
export function wrapEmail(email: Pick<InboxEmail, 'from' | 'subject' | 'body'>): string {
  return `<email from="${email.from}" subject="${email.subject}">\n${email.body}\n</email>`;
}

/**
 * The messages for one summary: instructions, then the whole inbox with the player's email on top, then the
 * rules again (the "sandwich"). No history.
 */
export function buildInboxMessages(level: Level, secret: string, email: PlayerEmail) {
  const fixed = (level.inbox?.emails ?? []).map((e) => wrapEmail({ ...e, body: e.body.replaceAll('{{secret}}', secret) }));
  return [
    { role: 'system' as const, content: level.systemPrompt.replaceAll('{{secret}}', secret) },
    { role: 'user' as const, content: ['Summarise my inbox.', wrapEmail(email), ...fixed, level.inbox?.reminder ?? ''].join('\n\n').trim() },
  ];
}
