#!/usr/bin/env node
// Play a level from the terminal against the dev server, to tune difficulty.
// Usage:
//   node tools/playtest.mjs [--new] --level <n> "message one" "message two" ...
//   node tools/playtest.mjs --level 3 --submit <pin>
//   node tools/playtest.mjs --level 4 --subject "Hi" [--from "A customer"] "email body" ...
//   node tools/playtest.mjs --report
// --new starts a fresh player (a fresh run from today's pool). The cookie is kept in .tmp/playtest-cookie.
// --unlock <n> marks levels 1..n solved for this player in the LOCAL database, to test a later level from a clean history.
// Every message uses the real Workers AI allowance, the same one players use.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:4321';
const jar = '.tmp/playtest-cookie';
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args.splice(i, 2)[1] : undefined;
};
const fresh = args.includes('--new') && args.splice(args.indexOf('--new'), 1);
const wantReport = args.includes('--report') && args.splice(args.indexOf('--report'), 1);
const level = Number(flag('--level'));
const submit = flag('--submit');
const unlock = Number(flag('--unlock') ?? 0);
// Inbox levels: each message is the body of an email with this subject.
const subject = flag('--subject');
const from = flag('--from') ?? 'A customer';
const messages = args;

mkdirSync('.tmp', { recursive: true });
if (fresh) rmSync(jar, { force: true });
let cookie = existsSync(jar) ? readFileSync(jar, 'utf8') : '';

async function call(path, body) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: base, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) {
    cookie = set.split(';')[0];
    writeFileSync(jar, cookie);
  }
  return res;
}

const run = await call('/api/run', {});
console.log('run:', run.status, await run.text());

if (unlock) {
  const id = decodeURIComponent(cookie.split('=')[1] ?? '').replace(/\.[^.]*$/, '');
  const now = new Date().toISOString();
  const sql = Array.from({ length: unlock }, (_, i) =>
    `INSERT INTO progress (player_id, level, solved_at) VALUES ('${id}', ${i + 1}, '${now}') ON CONFLICT (player_id, level) DO UPDATE SET solved_at = '${now}';`,
  ).join(' ');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'break-the-ai', '--local', '--command', sql], { stdio: 'ignore' });
  console.log(`unlocked levels 1..${unlock} (local only)`);
}

if (wantReport) {
  const res = await call('/api/report', {});
  const data = await res.json();
  console.log('report:', res.status, data.id ? `${base}/report/${data.id}` : data);
}

if (submit) {
  const res = await call('/api/submit', { level, secret: submit });
  console.log(`submit ${submit}:`, res.status, await res.text());
}

for (const message of messages) {
  console.log(`\n> ${message}`);
  const res = await call('/api/chat', subject ? { level, email: { from, subject, body: message } } : { level, message });
  if (!res.ok) {
    console.log('  !', res.status, await res.text());
    continue;
  }
  let reply = '';
  let done = '';
  for (const event of (await res.text()).split('\n\n')) {
    const name = /^event: (.+)$/m.exec(event)?.[1];
    const data = /^data: (.+)$/m.exec(event)?.[1];
    if (name === 't') reply += JSON.parse(data);
    if (name === 'done' || name === 'error') done = data;
  }
  console.log(`  ${reply.replace(/\n/g, '\n  ')}\n  => ${done}`);
}
