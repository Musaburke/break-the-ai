# AGENTS.md

Break the AI (working title): a browser game where the player is a red-team contractor attacking a fictional bank's AI products. Six levels, a debrief per level, a shareable pentest report. Musa Burke's portfolio project.

The full plan, with every decision and the reasons: `docs/plan.md`. Read it before changing scope.

Astro 7 + `@astrojs/cloudflare` 14, one Cloudflare Worker, D1, Workers AI. TypeScript strict. Node 22+. Plain CSS with tokens (no Tailwind).

## Commands

| Command | What it does |
| --- | --- |
| `npx astro dev --background` | Dev server (port printed; 4330 is often taken by the AI field guide). Manage with `astro dev stop` / `status` / `logs`. One instance only. |
| `npm run check` | `wrangler types`, `astro check`, build, `vitest run`. Must pass before work is called done. |
| `npm test` | Unit tests only. |
| `npx wrangler d1 migrations apply break-the-ai --local` | Apply migrations to local D1. Drop `--local` (and add `--remote`) for production. |
| `npx wrangler deploy` | Deploy after `npm run build`. |
| `node tools/screenshot.mjs <path> [label] [--full]` | Desktop 1440 + mobile 390 screenshots to `.tmp/shots/`. Set `BASE_URL` to the dev server's port. |

## Rules that matter here

- **Workers AI is always remote, even in dev.** Every local message uses the same free daily allowance as players (10,000 neurons/day, resets 00:00 UTC). On the free plan with no card, going over gives 429 and never bills.
- **No public route may call the model without a reserved run.** Otherwise anyone can spend the allowance (OWASP LLM10).
- Secrets and system prompts live on the server only. Level secrets are `HMAC(SECRET_KEY, playerId + level)`, never stored. `SECRET_KEY` is in `.dev.vars` locally (gitignored) and a Worker secret in production.
- Model output is untrusted: render it as text (`textContent`), never as HTML.
- `public/_headers` covers static pages only. Worker responses get their headers in `src/middleware.ts`. Change both together.
- The repo is public. `docs/solutions.md` (one working attack per level) is gitignored and never committed.
- Design (Musa's call, 2026-11-10, replacing the first red/white pass he disliked): a poster-loud game in purple. Deep plum `#2b1055`, lilac-white type, acid lime `#c6f432` for every "go" (buttons, meter, Leaked), hot pink for small stickers. Unbounded (display, HUD) + Geist (text). The home page is a title screen: one screen plus a very short strip, never a long landing page. The play screen is a HUD on top, a task box on the left (context, task, hints), the bank's chat on the right.
- Approved overrides of the taste house rules, this project only: purple, small uppercase HUD labels, pill buttons, dotted rules, tilted stickers. Everything else still applies (no gradients, glows, glass, shadows at rest, monospace outside code).
- The bank stays its own green brand (`src/styles/bank.css`, inside `data-ui="bank"`), never purple or lime, so the target always looks different from the player's side.
- Score: 1,000 per level, −50 per message, −150 per hint, floor 100 (`src/engine/score.ts`), computed on the server.

## Where things live

- `src/pages/`: prerendered pages; `src/pages/api/`: Worker routes (`export const prerender = false`).
- `src/engine/`: shared level engine (prompting, defences, win checks, budget). `src/levels/0N.ts`: one file per level.
- `migrations/`: D1 schema.
- `tools/`: scripts. `workflows/`: step-by-step SOPs. `.tmp/`: disposable output.
