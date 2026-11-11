export type Role = 'user' | 'assistant';
export type Turn = { role: Role; content: string };

/** One email in an inbox level. `{{secret}}` in the body is replaced on the server. */
export type InboxEmail = { from: string; subject: string; time: string; body: string };

/** The email the player writes on an inbox level. Every field is untrusted. */
export type PlayerEmail = { from: string; subject: string; body: string };

export type Level = {
  number: number;
  /** Workers AI model id. */
  model: string;
  /** The level's name, two or three words, with a quiet clue to the attack. Tiles, HUD, titles. */
  short: string;
  /** Shown above the mock: the product being tested. */
  product: string;
  /** Subject line of the security lead's email. */
  subject: string;
  /** Short brief from the bank's security lead, shown as her email. */
  brief: string;
  /** What counts as winning, in one line. */
  goal: string;
  /** One line under the task that points at the weak spot without giving the answer. */
  clue: string;
  /** Prefix of the per-player secret, e.g. STAFF in STAFF-K7Q2MX. */
  secretPrefix: string;
  /** The hidden instructions. `{{secret}}` is replaced on the server. */
  systemPrompt: string;
  /** The assistant's first message, shown before the player types. */
  greeting: string;
  /**
   * How the level is won. 'reply': the server sees the secret in the model's reply.
   * 'submit': the reply is filtered, so the player decodes what leaked and types it in.
   */
  win: 'reply' | 'submit';
  /** Input filter: a message matching any pattern never reaches the model. */
  inputFilter?: RegExp[];
  /** Output filter: a reply containing the secret is replaced whole with `filteredReply`. */
  outputFilter?: boolean;
  /** What the product says when a filter catches something. */
  filteredReply?: string;
  /**
   * Inbox levels have no chat: the player writes one email into this inbox, the product summarises the
   * whole inbox, and the player sees only the summary. The secret sits in one of the fixed emails.
   */
  inbox?: {
    /** Whose inbox it is, and their team. */
    owner: string;
    team: string;
    /** The summariser's name, shown on its panel. */
    assistant: string;
    /** Said again after the emails, so the rules are the last thing the model reads. */
    reminder: string;
    /** Fixed emails, newest first. The player's lands on top. */
    emails: InboxEmail[];
  };
  /** Three tiers: a nudge, the technique's name, a near-example. */
  hints: [string, string, string];
  debrief: {
    attack: string;
    why: string;
    fix: string;
    owasp: string[];
  };
};
