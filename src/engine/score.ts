// Points for a solved level. Worked out on the server from the counts it already keeps, so it can't be faked.
// Every message costs a little, a hint costs more: hints are a real choice, not free help.
// A level whose clue was shown (automatically on Easy, or by asking on Normal) is worth CLUE_COST less.
// It's charged per level and never refunded, so switching difficulty can't hide a clue already seen.

export const LEVEL_POINTS = 1000;
export const MESSAGE_COST = 50;
export const HINT_COST = 150;
export const CLUE_COST = 250;
export const MIN_POINTS = 100;

export function levelScore(messages: number, hints: number, clue = false): number {
  return Math.max(MIN_POINTS, LEVEL_POINTS - messages * MESSAGE_COST - hints * HINT_COST - (clue ? CLUE_COST : 0));
}
