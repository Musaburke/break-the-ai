import { describe, expect, it } from 'vitest';
import {
  DAILY_NEURONS,
  MESSAGES_PER_LEVEL,
  MESSAGES_PER_RUN,
  NEURONS_PER_AGENT_MESSAGE,
  NEURONS_PER_CHAT_MESSAGE,
  PLANNED_NEURONS,
  RUNS_PER_DAY,
} from '../src/engine/budget';
import { levels } from '../src/levels';

// A cheap guard on the daily allowance, from the per-message estimates in budget.ts.
describe('daily AI budget', () => {
  const agentLevels = levels.filter((l) => l.agent).length;
  const chatLevels = levels.length - agentLevels;
  const perRun = MESSAGES_PER_LEVEL * (chatLevels * NEURONS_PER_CHAT_MESSAGE + agentLevels * NEURONS_PER_AGENT_MESSAGE);

  it('gives every released level its full message allowance', () => {
    expect(MESSAGES_PER_RUN).toBe(levels.length * MESSAGES_PER_LEVEL);
  });
  it('keeps a full day of runs inside the planned share of the allowance', () => {
    expect(RUNS_PER_DAY * perRun).toBeLessThanOrEqual(PLANNED_NEURONS);
    expect(PLANNED_NEURONS).toBeLessThan(DAILY_NEURONS);
  });
});
