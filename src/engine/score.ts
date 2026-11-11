// Points for a solved level. Worked out on the server from the counts it already keeps, so it can't be faked.
// Every message costs a little, a hint costs more: hints are a real choice, not free help.

export const LEVEL_POINTS = 1000;
export const MESSAGE_COST = 50;
export const HINT_COST = 150;
export const MIN_POINTS = 100;

export function levelScore(messages: number, hints: number): number {
  return Math.max(MIN_POINTS, LEVEL_POINTS - messages * MESSAGE_COST - hints * HINT_COST);
}
