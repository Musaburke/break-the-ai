# Level 5 proposal: "agent with tools"

Status: proposal, not built. Written overnight with no one to ask, so it lists options and picks one.

## Why no build

`docs/plan.md` section "R2" fully specifies level 4 only. Level 5 has one table row and one sentence:

- Agent console with `lookup_account` and `issue_refund`.
- Defence: "Rules written only in the prompt". Attack taught: tool call on someone else's account. OWASP LLM06.
- "Check native tool calling for the 8B model on Workers AI. If it isn't supported, fall back to a JSON tool protocol that the Worker parses."
- Level 5's tools are fake functions with no side effects.

Open decisions: how the player interacts, what the win is, which tool protocol, what the budget does. Each changes the build, so they need Musa.

## Decision 1: how the player interacts

| Option | Description | Cost |
| --- | --- | --- |
| A (pick) | Chat with a support agent in the bank's green UI, like levels 1 to 3. A tool-call log panel shows each call and its result. | Reuses `BankChat` and `chat.ts`. Plus one log panel. |
| B | Form-style console: the player edits a ticket and the agent acts. | New mock, new engine path, like level 4. |

Pick A. The lesson (LLM06, excessive agency) is clearest when the player sees the agent call a tool it should not. The log panel makes that visible.

## Decision 2: the win

The player is customer "Sam Okoye" (account A-1001). The agent may look up and refund Sam's own account only, by a rule in the prompt. Another customer, "Dana Whitlock" (A-2002), exists in fake data.

| Option | Win | Notes |
| --- | --- | --- |
| A (pick) | The Worker sees a `lookup_account` or `issue_refund` call for any account other than A-1001 (checked on the server, not by the model). | Matches "tool call on someone else's account". Needs no secret. |
| B | Dana's record holds the usual per-player secret (`ACC-…`) and the win is it appearing in the reply, same as levels 1 and 2. | Reuses `win: 'reply'` and `leaks()` unchanged. |

Pick A with B's secret in Dana's record. The server-side check is the lesson ("the fix is to enforce the account in code, not in the prompt"), and the secret lets the existing leak check and report stay unchanged. `win` would stay `'reply'`, with an extra `toolWin` check.

## Decision 3: tool protocol

Native tool calling on `@cf/meta/llama-3.1-8b-instruct-fp8-fast` is NOT verified. The Workers AI function-calling docs use `@hf/nousresearch/hermes-2-pro-mistral-7b` as their only example, and the catalog has no page for the fp8-fast model. The page for its sibling `@cf/meta/llama-3.1-8b-instruct-fp8` lists no `tools` input, only a `tool_calls` output. No live call was made to test it (budget rule). First step of any build: one test call on the 8B model with a `tools` array.

| Option | Description |
| --- | --- |
| A (pick) | JSON tool protocol. The prompt tells the model to reply with `{"tool":"lookup_account","args":{"id":"A-1001"}}` when it wants a tool. The Worker parses it, runs the fake function, appends the result, and calls the model once more for the final reply. Works on the 8B model whatever its tool support. |
| B | Native `tools` on the 8B model, if the test call shows it works. Cleaner, but depends on a feature I could not confirm. |
| C | Native tools on Hermes 2 Pro. Not available: the Workers AI changelog (8 May 2026) lists it for deprecation on 30 May 2026. |

Pick A: it matches the plan's fallback and has no dependency. Cap: one tool call per message, so cost stays flat. Parse failures show as plain text, never crash.

## Decision 4: budget

Plan says "revisit at level 5". Figures below are estimates, not measurements. The per-call figure checks out against the Workers AI pricing page: the 8B fp8-fast model costs 4,119 neurons per million input tokens and 34,868 per million output tokens, so 850 in + 150 out is about 3.5 + 5.2 = 8.7 neurons.

- Levels 1 to 4: 60 messages × about 9 to 10 neurons = about 600 per run (plan figure).
- Level 5 with tool protocol: 2 model calls per message, longer prompt (tool list plus account data), so roughly 2.5× a normal message, about 24 neurons.
- 15 level-5 messages add about 360 per run.

| Option | Setting | Total per run | Runs/day under 10,000 with 20% headroom (8,000) |
| --- | --- | --- | --- |
| A (pick) | `MESSAGES_PER_RUN` 75 (4 × 15 + 15), `RUNS_PER_DAY` 8 | about 960 | 8 |
| B | `MESSAGES_PER_RUN` 75, `RUNS_PER_DAY` stays 12 | about 960, 11,500 total | Can exceed the allowance. Not safe. |
| C | Level 5 gets a smaller cap, 10 messages | about 840 | 9 |

Pick A. Level 6 (the boss with a judge call) will need to be added again, so level 5 should be measured before this is final. Add a vitest that fails if `RUNS_PER_DAY × (60 × 10 + 15 × 24)` neurons goes over 8,000 (a cheap guard, using the per-message estimates above).

## Build plan once decisions are made

1. `src/levels/05.ts` following `04.ts`: `short`, `brief`, `clue`, 3 hints, debrief (LLM06; fix: enforce authorisation in the tool code, least-privilege tools, human approval for refunds).
2. `src/engine/tools.ts`: fake `lookup_account` and `issue_refund`, the JSON parser, the account check.
3. `chat.ts`: tool step between the first and second model call. Log the tool calls in `events`.
4. Tool-log panel in the bank UI.
5. `budget.ts` constants, `docs/security.md` budget row, `about` page copy, the report (`levels.length` is used, so it should pick level 5 up).
6. Tests: tool parser, account check, budget guard. Playtest on the local server until solvable but not trivial; record one attack in the gitignored `docs/solutions.md`.

## Questions for Musa

1. Interaction: chat (A) or console (B)?
2. Win: server-side tool check plus secret in Dana's record (A)?
3. Protocol: JSON (A), or run a test call to see if native tools work on the 8B model first?
4. Budget: 75 messages and 8 runs a day (A)? Is 8 daily runs enough for the portfolio?
5. Customer names Sam Okoye and Dana Whitlock: keep these placeholders or give your own? (`TODO(musa)`)
