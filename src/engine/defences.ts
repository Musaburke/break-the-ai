import { leaks } from './leak';
import type { Level } from './types';

const DEFAULT_FILTERED = "Sorry, I can't help with that.";

/**
 * The word that tripped the level's input filter, or null when the message is clean.
 * The game tells the player which word it was: real filters stay quiet, but here the point is to learn how they work.
 */
export function blockedInput(level: Level, message: string): string | null {
  for (const pattern of level.inputFilter ?? []) {
    const hit = pattern.exec(message);
    if (hit) return hit[0];
  }
  return null;
}

/**
 * What the player sees. With an output filter, a reply that contains the secret is replaced whole,
 * the way real filters block a message rather than blank out one word. The check is the same one the
 * win uses, so spacing or case tricks are caught too; only encodings it can't see get through.
 */
export function shownReply(level: Level, reply: string, secret: string): string {
  return level.outputFilter && leaks(reply, secret) ? (level.filteredReply ?? DEFAULT_FILTERED) : reply;
}

export function filteredReply(level: Level): string {
  return level.filteredReply ?? DEFAULT_FILTERED;
}
