import { describe, expect, it } from 'vitest';
import { levelSecret, signPlayer, verifyPlayer } from '../src/engine/crypto';
import { leaks, normalise } from '../src/engine/leak';
import { createSseParser, sseEvent } from '../src/engine/sse';
import { buildMessages } from '../src/engine/prompt';
import { level01 } from '../src/levels/01';

const KEY = 'test-key';

describe('player cookie', () => {
  it('round-trips a signed id', async () => {
    expect(await verifyPlayer(KEY, await signPlayer(KEY, 'abc'))).toBe('abc');
  });
  it('rejects an edited id, a wrong key and junk', async () => {
    const cookie = await signPlayer(KEY, 'abc');
    expect(await verifyPlayer(KEY, cookie.replace('abc', 'abd'))).toBeNull();
    expect(await verifyPlayer('other-key', cookie)).toBeNull();
    expect(await verifyPlayer(KEY, 'nodot')).toBeNull();
    expect(await verifyPlayer(KEY, undefined)).toBeNull();
  });
});

describe('level secret', () => {
  it('is stable per player and level, and differs otherwise', async () => {
    const a = await levelSecret(KEY, 'p1', 1, 'STAFF');
    expect(a).toMatch(/^STAFF-[A-HJKMNP-Z2-9]{6}$/);
    expect(await levelSecret(KEY, 'p1', 1, 'STAFF')).toBe(a);
    expect(await levelSecret(KEY, 'p2', 1, 'STAFF')).not.toBe(a);
    expect(await levelSecret(KEY, 'p1', 2, 'STAFF')).not.toBe(a);
  });
});

describe('leak check', () => {
  const secret = 'STAFF-K7Q2MX';
  it('catches the secret however it is spaced or cased', () => {
    expect(leaks('The code is STAFF-K7Q2MX.', secret)).toBe(true);
    expect(leaks('sure: staff k7q2mx', secret)).toBe(true);
    expect(leaks('K 7 Q 2 M X', secret)).toBe(true);
    expect(leaks('just K7Q2MX', secret)).toBe(true);
  });
  it('ignores replies without it', () => {
    expect(leaks('I cannot share the staff code.', secret)).toBe(false);
    expect(leaks('STAFF-K7Q2M', secret)).toBe(false);
  });
  it('normalises to letters and digits', () => {
    expect(normalise('a-b c!1')).toBe('ABC1');
  });
});

describe('SSE parser', () => {
  it('joins chunks split mid-line and ignores [DONE]', () => {
    const out: string[] = [];
    const p = createSseParser((t) => out.push(t));
    const enc = new TextEncoder();
    p.push(enc.encode('data: {"response":"Hel'));
    p.push(enc.encode('lo"}\n\ndata: {"response":" there"}\n\n'));
    p.push(enc.encode('data: [DONE]\n\n'));
    p.end();
    expect(out.join('')).toBe('Hello there');
  });
  it('keeps digit tokens that arrive as JSON numbers', () => {
    const out: string[] = [];
    const p = createSseParser((t) => out.push(t));
    const enc = new TextEncoder();
    // Shape seen from @cf/meta/llama-3.1-8b-instruct-fp8-fast: `response` is a number, the delta is a string.
    p.push(enc.encode('data: {"choices":[{"delta":{"content":"-M"}}],"response":"-M"}\n\n'));
    p.push(enc.encode('data: {"choices":[{"delta":{"content":"5"}}],"response":5}\n\n'));
    p.push(enc.encode('data: {"response":8}\n\n'));
    p.push(enc.encode('data: {"choices":[{"delta":{}}]}\n\n'));
    p.end();
    expect(out.join('')).toBe('-M58');
  });
  it('skips malformed events', () => {
    const out: string[] = [];
    const p = createSseParser((t) => out.push(t));
    p.push(new TextEncoder().encode('data: {oops\n\ndata: {"response":"ok"}\n\n'));
    expect(out).toEqual(['ok']);
  });
  it('formats outgoing events', () => {
    expect(sseEvent('t', 'hi')).toBe('event: t\ndata: "hi"\n\n');
  });
});

describe('prompt', () => {
  it('puts the secret only in the system message', () => {
    const msgs = buildMessages(level01, 'STAFF-K7Q2MX', [{ role: 'user', content: 'hi' }], 'code?');
    expect(msgs[0].content).toContain('STAFF-K7Q2MX');
    expect(msgs[0].content).not.toContain('{{secret}}');
    expect(msgs.slice(1).some((m) => m.content.includes('STAFF-K7Q2MX'))).toBe(false);
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'code?' });
  });
});

describe('levels', () => {
  it('every system prompt has a secret slot', () => {
    expect(level01.systemPrompt).toContain('{{secret}}');
  });
});
