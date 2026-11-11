import { describe, expect, it } from 'vitest';
import { visitorId } from '../src/engine/crypto';

describe('visitorId', () => {
  it('is stable within a day and changes the next day', async () => {
    const a = await visitorId('k', '2026-11-11', '203.0.113.7');
    expect(await visitorId('k', '2026-11-11', '203.0.113.7')).toBe(a);
    expect(await visitorId('k', '2026-11-12', '203.0.113.7')).not.toBe(a);
    expect(await visitorId('k', '2026-11-11', '203.0.113.8')).not.toBe(a);
  });

  it('never contains the address', async () => {
    expect(await visitorId('k', '2026-11-11', '203.0.113.7')).not.toContain('203');
  });
});
