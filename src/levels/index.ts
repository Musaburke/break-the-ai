import type { Level } from '../engine/types';
import { level01 } from './01';
import { level02 } from './02';
import { level03 } from './03';

/** Levels released so far, in order. Add the next level's file here when it ships. */
export const levels: Level[] = [level01, level02, level03];

export function getLevel(n: number): Level | undefined {
  return levels.find((l) => l.number === n);
}
