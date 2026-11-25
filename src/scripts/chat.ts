// The chat on /play/[level]. Model output is untrusted, so it only ever goes in through textContent.
import { levelScore } from '../engine/score';
import type { ToolRecord } from '../engine/tools';

const errors: Record<string, string> = {
  'no-player': 'Your session has ended. Start the contract again from the home page.',
  restart: 'A new day has started. Reload the page to continue.',
  limit: "You've used every message for this level.",
  solved: 'Already solved. Read the debrief.',
  locked: 'Solve the previous level first.',
  'ai-unavailable': 'The assistant is out of power for today. Your message was not counted.',
};

type LevelProgress = { level: number; messagesUsed: number; hintsUsed: number; solved: number; points: number };

// What the HUD shows. The server keeps the real counts; this mirrors them for display.
const hud = { used: 0, hints: 0, perLevel: 15, clue: false, unit: 'messages', done: false };

const fmt = (n: number) => n.toLocaleString('en-GB');

function renderHud() {
  const left = hud.perLevel - hud.used;
  const text = document.querySelector<HTMLElement>('[data-left]');
  if (text) text.textContent = `${left} ${left === 1 ? hud.unit.slice(0, -1) : hud.unit} left`;
  document.querySelectorAll<HTMLElement>('.meter-bar').forEach((bar, i) => bar.toggleAttribute('data-spent', i >= left));
  // Points still on offer for this level if the next message wins it.
  const points = document.querySelector<HTMLElement>('[data-level-points]');
  // Once the level is solved it shows the score it got instead (set by showLeaked).
  if (points && !hud.done) points.textContent = fmt(levelScore(hud.used + 1, hud.hints, hud.clue));
}
type Who = 'you' | 'bot' | 'system';

function bubble(log: HTMLElement, who: Who, text = ''): HTMLElement {
  const item = document.createElement('li');
  item.className = `bank-msg bank-msg--${who}`;
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
  return item;
}

/** Re-renders a finished reply with the leaked secret marked, still without ever using innerHTML. */
function markSecret(item: HTMLElement, secret: string) {
  const text = item.textContent ?? '';
  const at = text.toUpperCase().indexOf(secret.toUpperCase());
  if (at < 0) return;
  const mark = document.createElement('mark');
  mark.textContent = text.slice(at, at + secret.length);
  item.replaceChildren(text.slice(0, at), mark, text.slice(at + secret.length));
}

function showLeaked(chatForm: HTMLFormElement, secret?: string, animate = true, points?: number, note = '') {
  chatForm.hidden = true;
  hud.done = true;
  // The way on stays in the task box after the Leaked screen closes.
  const cleared = document.querySelector<HTMLElement>('[data-cleared]');
  if (cleared) cleared.hidden = false;
  const submit = document.querySelector<HTMLFormElement>('[data-submit]');
  if (submit) submit.hidden = true;
  const panel = document.querySelector<HTMLElement>('[data-leaked]')!;
  const secretEl = panel.querySelector<HTMLElement>('[data-leaked-secret]')!;
  secretEl.textContent = secret ? secret.toUpperCase() : '';
  panel.querySelector<HTMLElement>('[data-leaked-points]')!.textContent = points ? `+${fmt(points)} pts` : '';
  const noteEl = panel.querySelector<HTMLElement>('[data-leaked-note]');
  if (noteEl) noteEl.textContent = note;
  if (points) {
    // The level is over: the HUD shows what it scored, not what a next message would be worth.
    const levelPoints = document.querySelector<HTMLElement>('[data-level-points]');
    if (levelPoints) levelPoints.textContent = fmt(points);
    const score = document.querySelector<HTMLElement>('[data-score]');
    if (score) score.textContent = fmt(Number(score.textContent?.replace(/\D/g, '') || 0) + points);
    document.querySelector(`[data-pip="${document.querySelector<HTMLElement>('[data-chat]')?.dataset.level}"]`)?.setAttribute('data-solved', '');
  }
  // On a reload of a solved level there's no moment to play: skip the sweep.
  if (!animate) panel.querySelectorAll<HTMLElement>('*').forEach((el) => (el.style.animation = 'none'));
  panel.hidden = false;
  panel.focus();
  panel.querySelector('[data-leaked-close]')?.addEventListener('click', () => (panel.hidden = true), { once: true });
}

const TOOL_LABELS: Record<string, string> = { lookup_account: 'Looked up an account', issue_refund: 'Issued a refund' };

/** What a tool result says in one line: the error, or what happened. */
function toolStatus(rec: ToolRecord): string {
  if (!rec.ok) {
    try {
      return (JSON.parse(rec.result) as { error?: string }).error ?? 'Failed.';
    } catch {
      return 'Failed.';
    }
  }
  return rec.tool === 'issue_refund' ? `Refund of £${rec.amount?.toFixed(2)} queued.` : 'Returned the account record.';
}

/** Shows how many calls are in the log next to its title: on a phone only the newest one is in view. */
function countTools(list: HTMLElement) {
  const count = list.querySelectorAll('.bank-tool').length;
  const el = list.closest('[data-ui]')?.querySelector<HTMLElement>('[data-tool-count]');
  if (el) el.textContent = count ? ` · ${count}` : '';
}

/**
 * Adds one tool call to the agent's action log, newest on top. Every field came from the model or from a
 * result the model asked for, so it's all set through textContent.
 */
function toolEntry(list: HTMLElement, rec: ToolRecord, fresh = false): HTMLElement {
  list.querySelector('[data-tool-empty]')?.setAttribute('hidden', '');
  const item = document.createElement('li');
  item.className = fresh ? 'bank-tool bank-tool--new' : 'bank-tool';
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };

  const top = el('div', 'bank-tool-top');
  top.appendChild(el('span', 'bank-tool-name', TOOL_LABELS[rec.tool] ?? rec.tool));
  if (rec.account) {
    const acct = el('span', 'bank-tool-acct', `${rec.account} · ${rec.own ? 'You' : 'Not you'}`);
    if (!rec.own) acct.dataset.other = '';
    top.appendChild(acct);
  }
  const args = [rec.account ? `"${rec.account}"` : '', rec.amount !== undefined ? String(rec.amount) : ''].filter(Boolean).join(', ');
  const status = el('p', 'bank-tool-status', toolStatus(rec));
  if (!rec.ok) status.dataset.failed = '';

  const details = document.createElement('details');
  details.appendChild(el('summary', '', 'Result'));
  let pretty = rec.result;
  try {
    pretty = JSON.stringify(JSON.parse(rec.result), null, 2);
  } catch {
    // Not JSON: show it as it came.
  }
  details.appendChild(el('pre', 'bank-tool-result', pretty));

  for (const part of [top, el('p', 'bank-tool-call', `${rec.tool}(${args})`), status, details]) item.appendChild(part);
  list.insertBefore(item, list.firstChild);
  list.scrollTop = 0;
  countTools(list);
  return item;
}

type ReplyHandlers = {
  text: (sofar: string) => void;
  tool?: (rec: ToolRecord) => void;
  blocked?: (word: string) => void;
  error: () => void;
  done: (payload: { solved: boolean; levelLeft: number; secret?: string; points?: number }) => void;
};

/** Reads the server-sent events of one reply from /api/chat. */
async function readReply(res: Response, on: ReplyHandlers) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const raw of events) {
      const name = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (!name || !data) continue;
      const payload = JSON.parse(data);
      if (name === 't') {
        text += payload as string;
        on.text(text);
      }
      if (name === 'blocked') on.blocked?.(payload);
      if (name === 'tool') on.tool?.(payload);
      if (name === 'error') on.error();
      if (name === 'done') on.done(payload);
    }
  }
}

/** POSTs to /api/chat; on a refusal, returns the player-facing reason instead of the response. */
async function sendToChat(body: unknown): Promise<Response | string> {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok && res.body) return res;
  const { error } = (await res.json().catch(() => ({ error: '' }))) as { error: string };
  return errors[error] ?? 'Something went wrong. Try again.';
}

type Saved = { turns?: { role: 'user' | 'assistant'; content: string }[]; tools?: ToolRecord[] } | null;

/**
 * Inbox levels: the player sends an email from the task box and reads Inbox Assist's summary.
 * Each send is a fresh summary, so there's no chat log and no New chat.
 */
function mountInbox(root: HTMLElement, form: HTMLFormElement, level: number, perLevel: number, saved: Saved) {
  const summary = root.querySelector<HTMLElement>('[data-summary]')!;
  const meta = root.querySelector<HTMLElement>('[data-assist-meta]');
  const yours = root.querySelector<HTMLElement>('[data-yours]')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const field = (name: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  const total = root.querySelectorAll('.inbox-row').length;
  const note = (text: string) => {
    summary.textContent = text;
    summary.dataset.state = 'note';
  };

  // The email lands on top of the inbox, shown in full: it's the one thing here the player wrote.
  const showYours = (email: { from: string; subject: string; body: string }) => {
    yours.querySelector('[data-yours-initial]')!.textContent = email.from.trim()[0]?.toUpperCase() ?? '?';
    yours.querySelector('[data-yours-from]')!.textContent = email.from;
    yours.querySelector('[data-yours-subject]')!.textContent = email.subject;
    yours.querySelector('[data-yours-body]')!.textContent = email.body;
    yours.hidden = false;
    if (meta) meta.textContent = `Summary of ${total} emails`;
  };

  // The body's limit stays in view. Enter is a new line here (the attack needs them), so Ctrl/Cmd+Enter sends.
  const body = field('body') as HTMLTextAreaElement;
  const count = form.querySelector<HTMLElement>('[data-count]');
  const recount = () => count && (count.textContent = `${body.value.length} / ${body.maxLength}`);
  body.addEventListener('input', recount);
  body.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // Coming back shows the last email sent (also put back in the form, to edit) and the summary it got.
  const turns = saved?.turns ?? [];
  const lastEmail = [...turns].reverse().find((t) => t.role === 'user');
  const lastSummary = [...turns].reverse().find((t) => t.role === 'assistant');
  if (lastEmail) {
    try {
      const email = JSON.parse(lastEmail.content) as { from: string; subject: string; body: string };
      showYours(email);
      field('from').value = email.from;
      field('subject').value = email.subject;
      field('body').value = email.body;
      recount();
    } catch {
      // A malformed log entry: start from an empty form.
    }
  }
  if (lastSummary) {
    summary.textContent = lastSummary.content;
    delete summary.dataset.state;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    const email = { from: field('from').value.trim(), subject: field('subject').value.trim(), body: field('body').value.trim() };
    if (!email.from || !email.subject || !email.body) return;
    send.disabled = true;
    showYours(email);
    note('Summarising…');
    // On a phone the inbox sits under the form: bring the summary into view to watch it arrive.
    if (matchMedia('(max-width: 860px)').matches) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      summary.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    }

    const res = await sendToChat({ level, email });
    if (typeof res === 'string') {
      note(res);
      send.disabled = false;
      return;
    }
    await readReply(res, {
      text: (sofar) => {
        summary.textContent = sofar;
        delete summary.dataset.state;
      },
      error: () => note('The summary failed. Try again.'),
      done: (payload) => {
        hud.used = perLevel - payload.levelLeft;
        renderHud();
        if (payload.solved && payload.secret) {
          markSecret(summary, payload.secret);
          const secret = payload.secret;
          setTimeout(() => showLeaked(form, secret, true, payload.points), 700);
        }
      },
    });
    send.disabled = false;
  });
}

// Levels with an output filter are won by typing in the decoded secret.
function mountSubmit(level: number, chatForm: HTMLFormElement) {
  const form = document.querySelector<HTMLFormElement>('[data-submit]');
  if (!form) return;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const status = form.querySelector<HTMLElement>('[data-submit-status]')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, secret: input.value }),
    });
    const data = (await res.json()) as { correct?: boolean; triesLeft?: number; error?: string; points?: number };
    button.disabled = false;
    if (data.correct) showLeaked(chatForm, input.value.trim(), true, data.points);
    else if (data.error === 'no-more-tries') status.textContent = 'No guesses left for this level.';
    else status.textContent = `Not it. ${data.triesLeft ?? 0} guesses left.`;
  });
}

function showClueText(text: string) {
  const clue = document.querySelector<HTMLElement>('[data-clue]');
  if (!clue) return;
  clue.querySelector('[data-clue-text]')!.textContent = text;
  clue.hidden = false;
  document.querySelector<HTMLElement>('[data-clue-show]')?.setAttribute('hidden', '');
  document.querySelector<HTMLElement>('[data-clue-note]')?.setAttribute('hidden', '');
  hud.clue = true;
  renderHud();
}

function mountHints(level: number, total: number, playable: boolean, easy: boolean) {
  const list = document.querySelector<HTMLElement>('[data-hint-list]')!;
  const button = document.querySelector<HTMLButtonElement>('[data-hint]')!;
  const render = (hints: string[]) => {
    list.replaceChildren();
    for (const hint of hints) {
      const item = document.createElement('li');
      item.textContent = hint;
      list.appendChild(item);
    }
    const left = total - hints.length;
    button.textContent = left ? `Get hint ${hints.length + 1}` : 'No hints left';
    button.disabled = left === 0;
    hud.hints = hints.length;
    renderHud();
  };

  fetch(`/api/hint?level=${level}`)
    .then(async (res) => {
      const data = (await res.json()) as { hints?: string[]; clue?: string };
      return res.ok ? data : {};
    })
    .then((data) => {
      render(data.hints ?? []);
      // The server sends the clue on Easy or once it's been shown. Otherwise Normal players can ask for it.
      if (data.clue) showClueText(data.clue);
      else if (playable) {
        document.querySelector<HTMLElement>('[data-clue-show]')?.removeAttribute('hidden');
        // On Easy with no clue sent, the level was already started: say why it didn't appear.
        if (easy) document.querySelector<HTMLElement>('[data-clue-note]')?.removeAttribute('hidden');
      }
    });

  document.querySelector<HTMLButtonElement>('[data-clue-show]')?.addEventListener('click', async (event) => {
    const show = event.currentTarget as HTMLButtonElement;
    show.disabled = true;
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, clue: true }),
    });
    const data = (await res.json().catch(() => ({}))) as { clue?: string };
    if (data.clue) showClueText(data.clue);
    show.disabled = false;
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
    if (res.ok) render(((await res.json()) as { hints: string[] }).hints);
    else button.disabled = false;
  });
}

export async function mountChat(root: HTMLElement) {
  const level = Number(root.dataset.level);
  const perLevel = Number(root.dataset.perLevel);
  const inbox = root.dataset.kind === 'inbox';
  if (inbox) hud.unit = 'emails';
  const log = root.querySelector<HTMLElement>('[data-log]');
  const form = root.querySelector<HTMLFormElement>('[data-form]')!;
  const input = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  // A line from the game itself: in the chat log, or in the summary panel on an inbox level.
  const notice = (text: string) => {
    if (log) bubble(log, 'system', text);
    const summary = root.querySelector<HTMLElement>('[data-summary]');
    if (summary) {
      summary.textContent = text;
      summary.dataset.state = 'note';
    }
  };

  // Resumes the run, or reserves one. Full today goes to /full; anything else (including the per-visitor
  // limit, which the home page explains) back to the start.
  const run = await fetch('/api/run', { method: 'POST' });
  if (!run.ok) {
    location.href = run.status === 409 ? '/full' : '/';
    return;
  }
  await run.json();
  const progressRes = await fetch('/api/progress');
  const progress = (await progressRes.json()) as { levels?: LevelProgress[]; score?: number; mode?: string };
  if (!progressRes.ok || !progress.levels) {
    // The session didn't stick (cookies blocked, or it expired). Say so instead of failing silently.
    notice("Your session didn't start. Check cookies are allowed for this site, then reload.");
    send.disabled = true;
    return;
  }
  const here = progress.levels.find((l) => l.level === level);
  hud.perLevel = perLevel;
  const easy = progress.mode === 'easy';
  const modeTag = document.querySelector<HTMLElement>('[data-mode-tag]');
  if (modeTag) modeTag.textContent = ` · ${easy ? 'Easy' : 'Normal'}`;
  hud.used = here?.messagesUsed ?? 0;
  hud.hints = here?.hintsUsed ?? 0;
  renderHud();
  document.querySelector<HTMLElement>('[data-score]')!.textContent = fmt(progress.score ?? 0);
  progress.levels.filter((l) => l.solved).forEach((l) => document.querySelector(`[data-pip="${l.level}"]`)?.setAttribute('data-solved', ''));
  if (here?.solved) {
    showLeaked(form, undefined, false);
    const levelPoints = document.querySelector<HTMLElement>('[data-level-points]');
    if (levelPoints) levelPoints.textContent = fmt(here.points);
  }
  // Levels open in order (the server enforces it); say so up front rather than after a wasted message.
  const previousSolved = level === 1 || progress.levels.some((l) => l.level === level - 1 && l.solved);
  if (!previousSolved) {
    notice(`Locked. Solve level ${level - 1} first.`);
    send.disabled = true;
    input.disabled = true;
  }
  // The conversation so far comes back on every visit, so leaving to the menu loses nothing,
  // and what's on screen is always what the model remembers. Only New chat starts over.
  // The body is always read: an unread body keeps the request open.
  const newChat = () =>
    fetch('/api/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level }) })
      .then((res) => res.json())
      .catch(() => null);
  const newChatButton = root.querySelector<HTMLButtonElement>('[data-new-chat]');
  const saved = (await fetch(`/api/conversation?level=${level}`)
    .then((res) => res.json())
    .catch(() => null)) as Saved;
  mountHints(level, Number(root.dataset.hints), previousSolved && !here?.solved, easy);
  if (inbox) {
    // A locked level must not overwrite its "Locked" note with an old summary; there isn't one anyway.
    if (previousSolved) mountInbox(root, form, level, perLevel, saved);
    // Once the level has started, the brief has been read: fold it so the form fits on the first screen.
    if (hud.used > 0) document.querySelector<HTMLDetailsElement>('[data-ctx]')?.removeAttribute('open');
    return;
  }
  if (!log) return;
  saved?.turns?.forEach((t) => bubble(log, t.role === 'user' ? 'you' : 'bot', t.content));
  // Agent levels: the action log since the latest new chat, oldest first, so the newest ends on top.
  const toolLog = root.querySelector<HTMLElement>('[data-tool-log]');
  if (toolLog) saved?.tools?.forEach((rec) => toolEntry(toolLog, rec));
  if (here?.solved || !previousSolved) {
    if (newChatButton) newChatButton.hidden = true;
  } else {
    newChatButton?.addEventListener('click', async () => {
      if (send.disabled) return;
      newChatButton.disabled = true;
      await newChat();
      // Keep the greeting, drop the rest.
      [...log.children].slice(1).forEach((el) => el.remove());
      toolLog?.querySelectorAll('.bank-tool').forEach((el) => el.remove());
      toolLog?.querySelector('[data-tool-empty]')?.removeAttribute('hidden');
      if (toolLog) countTools(toolLog);
      bubble(log, 'system', 'New chat. It has forgotten everything you said. Your messages used and points stay the same.');
      newChatButton.disabled = false;
      input.focus();
    });
  }
  mountSubmit(level, form);

  // Enter sends, Shift+Enter adds a line, like every chat widget.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    send.disabled = true;
    bubble(log, 'you', message);
    input.value = '';

    const res = await sendToChat({ level, message });
    if (typeof res === 'string') {
      bubble(log, 'system', res);
      send.disabled = false;
      return;
    }

    // Filtered levels send the reply in one piece, so show that the product is working on it.
    const reply = bubble(log, 'bot');
    const typing = document.createElement('span');
    typing.className = 'bank-typing';
    typing.textContent = 'Typing…';
    reply.appendChild(typing);
    let lastTool: HTMLElement | null = null;
    let lastRec: ToolRecord | null = null;

    await readReply(res, {
      // The call shows in the action log before the agent's answer arrives.
      tool: (rec) => {
        lastRec = rec;
        if (toolLog) lastTool = toolEntry(toolLog, rec, true);
        typing.textContent = 'Working…';
      },
      text: (sofar) => {
        reply.textContent = sofar;
        log.scrollTop = log.scrollHeight;
      },
      // Shown above the product's canned refusal, so the player can tell a filter from the model saying no.
      blocked: (word) => log.insertBefore(bubble(log, 'system', `Blocked by a filter: your message contained "${word}".`), reply),
      error: () => (reply.textContent = 'The reply failed. Try again.'),
      done: (payload) => {
        hud.used = perLevel - payload.levelLeft;
        renderHud();
        if (payload.solved && payload.secret) {
          markSecret(reply, payload.secret);
          // On an agent level the secret is usually in the tool result rather than the reply: open it and mark it.
          const result = lastTool?.querySelector<HTMLElement>('.bank-tool-result');
          if (lastTool && result) {
            lastTool.querySelector('details')?.setAttribute('open', '');
            markSecret(result, payload.secret);
          }
          const secret = payload.secret;
          const rec = lastRec as ToolRecord | null;
          const note = rec && !rec.own && rec.account ? `The agent ran ${rec.tool} on ${rec.account}, an account that isn't yours.` : '';
          // A beat to see the secret in the bank's own reply before the takeover.
          setTimeout(() => showLeaked(form, secret, true, payload.points, note), 700);
        }
      },
    });
    send.disabled = false;
    if (!form.hidden) input.focus();
  });
}
