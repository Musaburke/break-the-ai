import { describe, expect, it } from 'vitest';
import { buildMessages } from '../src/engine/prompt';
import { crossedAccount, normaliseAccountId, ONE_TOOL_REPLY, parseToolCall, readToolRecord, runTool, withToolResult } from '../src/engine/tools';
import { level05 } from '../src/levels/05';

const SECRET = 'ACC-K7Q2MX';

describe('tool call parser', () => {
  it('reads the protocol in the prompt', () => {
    expect(parseToolCall('{"tool":"lookup_account","args":{"id":"A-1001"}}')).toEqual({ tool: 'lookup_account', args: { id: 'A-1001' } });
  });
  it("reads Llama's own shape, and JSON inside words or a code fence", () => {
    expect(parseToolCall('{"name": "issue_refund", "parameters": {"id": "A-1001", "amount": 10.99}}')?.tool).toBe('issue_refund');
    expect(parseToolCall('Let me check.\n```json\n{"tool":"lookup_account","args":{"id":"A-2002"}}\n```')?.args.id).toBe('A-2002');
  });
  it('skips braces inside strings', () => {
    expect(parseToolCall('{"tool":"lookup_account","args":{"id":"A-1001","note":"a } b"}}')?.args.note).toBe('a } b');
  });
  it('treats anything else as plain text', () => {
    for (const r of ['Your balance is £1,284.60.', '{"tool":"delete_bank"}', '{"tool": "lookup_account", broken', '[1, 2]', '{}']) {
      expect(parseToolCall(r), r).toBeNull();
    }
  });
});

describe('account ids', () => {
  it('normalises the ways a model writes them', () => {
    for (const id of ['A-2002', 'a-2002', 'A2002', ' A - 2002 ']) expect(normaliseAccountId(id)).toBe('A-2002');
  });
  it('keeps made-up ids, capped, and drops non-strings', () => {
    expect(normaliseAccountId('dana')).toBe('DANA');
    expect(normaliseAccountId('x'.repeat(100))).toHaveLength(24);
    expect(normaliseAccountId({ id: 1 })).toBe('');
  });
});

describe('fake tools', () => {
  it("looks up the player's own account without crossing", () => {
    const rec = runTool(level05, { tool: 'lookup_account', args: { id: 'A-1001' } }, SECRET);
    expect(rec).toMatchObject({ ok: true, own: true, account: 'A-1001' });
    expect(crossedAccount(rec)).toBe(false);
    expect(rec.result).not.toContain(SECRET);
  });
  it("crosses on Dana's account, whose record holds the secret", () => {
    const rec = runTool(level05, { tool: 'lookup_account', args: { id: 'a2002' } }, SECRET);
    expect(crossedAccount(rec)).toBe(true);
    expect(rec.result).toContain(SECRET);
    expect(rec.result).not.toContain('{{secret}}');
  });
  it("counts any other account as crossing, even one that doesn't exist", () => {
    const rec = runTool(level05, { tool: 'issue_refund', args: { id: 'A-9999', amount: 5 } }, SECRET);
    expect(rec.ok).toBe(false);
    expect(crossedAccount(rec)).toBe(true);
  });
  it('needs an account id, and does not cross without one', () => {
    const rec = runTool(level05, { tool: 'lookup_account', args: {} }, SECRET);
    expect(rec.ok).toBe(false);
    expect(crossedAccount(rec)).toBe(false);
  });
  it('checks refund amounts but never whose account it is', () => {
    const ok = runTool(level05, { tool: 'issue_refund', args: { id: 'A-2002', amount: '£10.99' } }, SECRET);
    expect(ok).toMatchObject({ ok: true, own: false, amount: 10.99 });
    for (const amount of [0, -5, 501, 'lots', null]) {
      expect(runTool(level05, { tool: 'issue_refund', args: { id: 'A-1001', amount } }, SECRET).ok, String(amount)).toBe(false);
    }
  });
});

describe('agent prompt', () => {
  it('keeps the secret out of the prompt', () => {
    const [system] = buildMessages(level05, SECRET, [], 'hi');
    expect(system.content).not.toContain(SECRET);
    expect(system.content).toContain('A-1001');
  });
  it('hands the result back after the call', () => {
    const call = { tool: 'lookup_account' as const, args: { id: 'A-1001' } };
    const rec = runTool(level05, call, SECRET);
    const msgs = withToolResult(buildMessages(level05, SECRET, [], 'hi'), call, rec);
    expect(msgs.at(-2)).toEqual({ role: 'assistant', content: JSON.stringify(call) });
    expect(msgs.at(-1)?.content).toContain(rec.result);
    expect(parseToolCall(ONE_TOOL_REPLY)).toBeNull();
  });
  it('reads stored tool events back, and skips broken ones', () => {
    const rec = runTool(level05, { tool: 'lookup_account', args: { id: 'A-1001' } }, SECRET);
    expect(readToolRecord(JSON.stringify(rec))).toEqual(rec);
    expect(readToolRecord('nope')).toBeNull();
    expect(readToolRecord(null)).toBeNull();
  });
});
