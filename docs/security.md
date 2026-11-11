# Security and threat model

Break the AI is a game about attacking AI, so it will be attacked. This is what it protects, who might go after it, and what stops them. Reviewed 11 Nov 2026 (vibesec pass, release 1).

## What's worth protecting

| Asset | Why it matters |
| --- | --- |
| The daily Workers AI allowance (10,000 neurons) | It's shared by every player. If one person spends it, the game is down for everyone until midnight UTC. |
| `SECRET_KEY` | It signs player cookies and derives every level secret and visitor hash. With it, someone could forge players and read every answer. |
| The system prompts and level secrets | Leaking them through anything other than the game spoils it. |
| What players type | Kept for 30 days against an anonymous ID. The home page promises that. |
| Public reports | Anyone with the link can read one, so they must hold nothing a player typed. |

## Threats and what stops them

| Threat | Defence | Where |
| --- | --- | --- |
| Spending the AI allowance through the API | Every model call needs a reserved run. 12 runs a day, 60 messages each, 15 per level, 150 reply tokens, 500-character messages. On the inbox level an email counts as one message: from ≤ 60, subject ≤ 100, body ≤ 500 characters, one fresh call with no history. A message caught by the input filter never reaches the model. | `src/engine/budget.ts`, `src/engine/inbox.ts`, `src/pages/api/chat.ts` |
| One person emptying the run pool (12 requests and nobody else can play) | At most 3 run starts per visitor per day. The visitor is an HMAC of the IP keyed with the day; the address is never stored, and the rows are deleted the next day. When the pool turns out to be full, the visitor's start is given back. | `src/pages/api/run.ts`, `migrations/0002_run_starts.sql` |
| Forged or edited player cookies | The cookie is `id.HMAC(id)`, compared in constant time. `HttpOnly`, `SameSite=Lax`, `Secure` on https. | `src/engine/crypto.ts`, `src/engine/player.ts` |
| Cross-site requests spending a player's messages | Every non-GET `/api/` call must carry this site's `Origin`, or it gets a 403. | `src/middleware.ts` |
| Forging the model's past replies to steer it | Chat history is read from the server's own log, never sent by the browser. | `src/pages/api/chat.ts` |
| Sharing answers between players | Each secret is `HMAC(SECRET_KEY, player + level)`. It's never stored, and it's different for every player. | `src/engine/crypto.ts` |
| Guessing the level 3 PIN | 10 submits per level against 31^6 possibilities. | `src/pages/api/submit.ts` |
| Seeing a clue and then switching to Normal for full points | The clue never ships in the page. The server records `clue_seen` on the level before sending it (on Easy automatically, on Normal when asked), and that level costs 250 from then on. Switching difficulty never clears it. A clue isn't charged on a locked level or after a level is solved. | `src/pages/api/hint.ts`, `src/pages/api/mode.ts`, `src/engine/score.ts` |
| Skipping levels | The chat refuses a level until the previous one is solved, and the debrief redirects until its level is solved. | `src/pages/api/chat.ts`, `src/pages/debrief/[level].astro` |
| The secret reaching the browser before the output filter sees it | Levels with an output filter collect the whole reply before sending anything. | `src/pages/api/chat.ts` |
| XSS through model output | Model replies only ever go into the page with `textContent`. There is no `innerHTML` or `set:html` anywhere. | `src/scripts/chat.ts` |
| SQL injection | Every query is parameterised with `.bind()`. | all routes |
| Enumerating reports | Report ids are random (9 bytes, base64url) and checked against a strict pattern before any query. | `src/pages/api/report.ts`, `src/pages/report/[id].astro` |
| Keeping typed text longer than promised | A cron trigger at 03:00 UTC wipes message text older than 30 days. The rows stay, without text, so scores still add up. | `src/worker.ts`, `src/engine/retention.ts` |
| Leaking `SECRET_KEY` | `.dev.vars` is gitignored, and production uses a Worker secret. `docs/solutions.md` is gitignored too. | `.gitignore` |

## Known gaps (accepted for release 1)

- **The CSP allows `'unsafe-inline'` scripts.** Astro inlines small scripts, and the difficulty switch is an inline script. The risk is low because nothing renders HTML from user or model input. To close it, use Astro's CSP hashing or move each inline script to a file.
- **The per-visitor cap is per IP address.** Someone with many addresses can still start many runs. The daily pool still caps the AI spend, so the worst case is the game being full for a day, never a bill. If that happens, add Cloudflare Turnstile to `/api/run`.
- **Hints and submits don't check that the previous level is solved.** It does no harm: hints only cost points, and a submit needs the secret, which needs the locked chat.
- **Two racing requests on message 15 can both pass the per-level cap.** That costs at most one extra message, as noted in the code.

## Before every deploy

1. `npx wrangler d1 migrations apply break-the-ai --remote`
2. `npm run check`
3. On the preview URL, with the console open: play a level and check the response headers (`Content-Security-Policy`, `Strict-Transport-Security`) on a page, an `/api/` call and `/debrief/1`.
