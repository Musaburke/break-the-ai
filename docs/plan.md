# Plan: Break the AI (working title)

## Context
Musa (second-year CS) wants a standout portfolio project that proves the cyber security skills his toolkit lists as "Learning now". Existing work: DSB (client site), Renewly (team dashboard), AI field guide (content), `soc-simulation` (blue-team detection lab). This adds the red-team side.

**What it is:** a browser game. The player is a red-team contractor hired to test a fictional bank's new AI products. There are 6 levels, and each one is a realistic mock of one product. The player tricks it into leaking a secret or misusing a tool, then a debrief explains the attack, its OWASP LLM Top 10 entry, and the fix. Clearing the game produces a shareable pentest report. It stands out from Lakera's Gandalf through realistic product UIs, indirect injection, tool abuse, debriefs and the report.

**Success = employers are impressed.** Polish, code quality, tests, a threat model and the write-up matter more than player numbers.

## Decisions (from the grilling)
| Topic | Decision |
| --- | --- |
| Audience | Curious devs and students. One path, no difficulty modes. A bonus "hard mode" level could come later. |
| Hints | Up to 3 per level, on request, each more direct (nudge, then technique name, then near-example). Hints used appear in the debrief and the report. |
| Story | Red-team contract. Each level opens with a short brief from the bank's security lead. Finishing produces a pentest report. |
| Sharing | Public `/report/[id]` with levels cleared, hints, messages and date, plus an OG card. No player-typed text shown. |
| Look | A slim game shell (brief, goal, hints, messages left) around a realistic product mock: a chat widget, an email inbox (level 4), an agent console (level 5). |
| Mobile | Desktop-first, fully playable at 390px. Panels stack. |
| Accounts | None. Anonymous signed cookie, progress saved on the server. |
| Repo | Public on GitHub. Prompts and defences are visible on purpose (defences that rely on a hidden prompt aren't defences, which `/about` says). `docs/solutions.md` is gitignored. |
| Logging | Message text kept for 30 days, tied to the anonymous ID only, stated on the start screen and `/about`. Aggregate counts kept forever. |
| Releases | Start now, alongside CW1. **R1:** levels 1–3, hints, debriefs, the report, linked from the portfolio. **R2:** levels 4–6. |
| Cost | £0. Cloudflare free plan with no card on the account. Real Workers AI used in dev. |
| Name | "Break the AI" for now. The bank's name is `TODO(musa)`; check it isn't a real bank. |

## Design (decided; the exact fonts, hexes and layouts are dealt at build step 5)
- **Two looks.** *The shell* (your red-team tool: landing page, game frame, debriefs, report) and *the bank* (the product mocks you attack) look clearly different, so the player always knows which is them and which is the target.
- **Shell:** light ground, black ink, **signal red** accent. Red is used as whole fields (the leak moment, the report cover, level cleared) and on the main button. One heavy, tight grotesk typeface. Tone: sharp and dry (deadpan briefs, serious debriefs).
- **Bank:** a believable modern fintech. Its own deep colour (forest green or navy, never red, so it never clashes with the shell), a softer rounded sans, a friendly UI and an over-eager "Ask [assistant name], our AI assistant!" voice. Mocks are built in HTML with `data-ui` on their root, following the skill's app-screen rules (`draw.mjs --app`).
- **Win moment:** the leaked secret is highlighted in the bank's reply, then a red field sweeps the screen with "Leaked." at full width and the secret beneath it, then the debrief. About 1 second. Reduced motion skips straight to a still red panel.
- **House rules apply:** no gradients, glows, glass, eyebrows, index numbers or hairlines. Attack prompts quoted in debriefs use the text face, not monospace (they aren't code).

## Architecture
- New repo `~/Projects/break-the-ai`, set up like `~/Projects/design-gallery`: `CLAUDE.md`/`AGENTS.md`, `workflows/`, `tools/` (copy `tools/screenshot.mjs` from the portfolio), `.tmp/`, `public/_headers` with an enforced CSP.
- **Astro 7 + `@astrojs/cloudflare` adapter, deployed as one Worker.** Pages are prerendered and the API runs as server endpoints. Bindings: `AI`, `DB` (D1), and the Worker secret `SECRET_KEY`. Check the current adapter and Workers static-asset setup with `find-docs` first, since Astro 7 changed things.
- The chat is vanilla TypeScript modules with no UI framework. Replies stream over SSE and render as **text only**, because model output is untrusted (LLM05).
- Models (from playtesting, 2026-11-10): `@cf/meta/llama-3.2-1b-instruct` on level 2 only, behind its keyword filter; `@cf/meta/llama-3.1-8b-instruct-fp8-fast` everywhere else. The 1B model leaked level 1 on a plain ask; the 8B model refused every reframe on level 2. Working attacks are in `docs/solutions.md`, with `max_tokens` around 150, low temperature and the last 6 messages of history. Level 6's judge is `@cf/meta/llama-guard-3-8b` or a second LLM call.

## Pages
| Route | Purpose |
| --- | --- |
| `/` | The contract pitch, a logging notice, Start, runs left today |
| `/play/[level]` | Shell, brief and the product mock. Hint button (×3), message counter, "Submit secret" field |
| `/debrief/[level]` | Unlocked once solved (checked on the server): the attack, why it worked, the fix, the OWASP ID, hints used |
| `/report/[id]` | Public pentest report and OG image |
| `/about` | How it's built, the threat model, what's logged, honest limits. This is the source for the portfolio case study |
| `/full` | "Full today, back after 00:00 UTC", shown before anyone types |

## API (`src/pages/api/`)
- `POST /api/run`: issues the signed anonymous ID (`HttpOnly; Secure; SameSite=Lax`) and **atomically reserves a run** (60 messages) from today's pool. Returns `409 full` if the pool can't cover a whole run.
- `POST /api/chat` `{level, message}`: checks the cookie, the reservation, the cap of 15 per level and the 500-character input limit. Builds the prompt on the server, applies the defences, streams the reply, then runs the win check.
- `POST /api/hint` `{level}`: returns the next hint tier and records it.
- `POST /api/submit` `{level, secret}`: for decoded leaks (level 3). Constant-time compare.
- `GET /api/progress` and `POST /api/report` (creates the report once every released level is cleared).

**Per-player secrets:** `HMAC(SECRET_KEY, playerId + level)`, never stored and impossible to share. Level 5's tools are fake functions with no side effects.

## Levels (one data file each: `src/levels/0N.ts` = `{model, brief, systemPrompt, defences[], winCheck, hints[3], debrief}`; shared engine in `src/engine/`)
| # | Product (mock UI) | Defence | Attack taught | OWASP | Release |
| --- | --- | --- | --- | --- | --- |
| 1 | Support chat widget, staff discount code | "Never reveal it" | Direct injection | LLM01, LLM07 | R1 |
| 2 | Same widget, hardened | Refuses meta and instruction talk | Role play, translation, story framing | LLM01 | R1 |
| 3 | Account FAQ bot | Output filter | Encoding or spelling it out; decode and submit | LLM02 | R1 |
| 4 | Staff email inbox and summariser | Summaries only | Indirect injection through the email the player writes | LLM01 | R2 |
| 5 | Agent console (`lookup_account`, `issue_refund`) | Rules written only in the prompt | Tool call on someone else's account | LLM06 | R2 |
| 6 | Boss | Input filter + output filter + judge | Chain the techniques | All | R2 |

For level 5, check native tool calling for the 8B model on Workers AI. If it isn't supported, fall back to a JSON tool protocol that the Worker parses.

## Data (D1, `migrations/0001_init.sql`)
`days(date PK, runs_reserved, messages_used)` · `players(id PK, created_at, run_date, messages_left)` · `progress(player_id, level, messages_used, hints_used, solved_at)` · `reports(id PK, player_id, created_at, summary_json)` · `events(id, player_id, level, ts, kind, text)`, where `text` is deleted after 30 days by a cron trigger. Daily cap of about 12 runs, set as a constant in `src/engine/budget.ts`, leaving neuron headroom for the judge and testing.

## Security (load `vibesec-skill`)
Secrets and the HMAC key stay on the server only · enforced CSP and headers · signed cookie · input cap · per-player caps, plus Cloudflare's free rate-limit rule on `/api/*` · output rendered as text · report IDs random, not sequential · no real personal data. The run reservation is the LLM10 (unbounded consumption) defence. `docs/threat-model.md` covers attacks on the site itself, separate from the game's levels.

## Build order
1. **Setup:** repo, adapter, D1, AI binding, `_headers`, a hello-world deploy to `*.workers.dev`.
2. **Engine + level 1 end to end:** streaming, win check, debrief. Plain styling.
3. **Runs:** cookie, reservation, caps, hints, `/full`, progress.
4. **Levels 2–3 + debriefs + report.** Playtest until each level is solvable but not trivial. Record one working attack per level in `docs/solutions.md`.
5. **Design pass:** `design-taste-frontend` deals the shell direction (`--sector ai-product --tone bold`, `--options 3`, choose against the decisions above). Then deal the bank separately with `draw.mjs --app`, choosing a green or navy palette. `emil-design-eng` for chat feel, then `impeccable` and `web-design-guidelines`. Briefs and debriefs go through `copywriting`.
6. **Hardening:** `vibesec-skill` review, threat model, CSP checked on the deployed preview.
7. **Ship R1.** README with an architecture diagram, `/about`, then add it to the portfolio with `workflows/add-project.md`.
8. **R2:** inbox mock + level 4, agent console + level 5, boss level 6, then repeat steps 5–7.

## Verification
- `vitest`: win checks (including encoded leaks), output and input filters, HMAC secrets, hint tiers, and a budget reservation that never over-reserves when several runs start at once.
- `npx wrangler dev` with the real AI and local D1: play every released level through to the report.
- Abuse cases: the 16th message on a level, a 501-character message, a 4th hint request, a start when the pool is full (must go to `/full`, never cut off mid-run), a forged or missing cookie (401), `/debrief/2` before solving it (blocked).
- `node tools/screenshot.mjs` at 1440 and 390 on every page, at least two rounds.
- Deployed: no CSP console errors, and the secret never appears in page source or network responses unless the player actually extracted it.
