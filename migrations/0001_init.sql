-- Daily pool: how many runs have been reserved today. A run is reserved whole, so nobody runs out halfway.
CREATE TABLE days (
  date TEXT PRIMARY KEY,               -- UTC, YYYY-MM-DD
  runs_reserved INTEGER NOT NULL DEFAULT 0,
  messages_used INTEGER NOT NULL DEFAULT 0
);

-- Anonymous players. The id lives in a signed cookie; no names, emails or passwords.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  run_date TEXT NOT NULL,              -- the UTC day this player's run was reserved
  messages_left INTEGER NOT NULL
);

CREATE TABLE progress (
  player_id TEXT NOT NULL REFERENCES players(id),
  level INTEGER NOT NULL,
  messages_used INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  PRIMARY KEY (player_id, level)
);

-- Public pentest reports. The id is random, never sequential.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL,
  summary_json TEXT NOT NULL
);

-- Message log. `text` is cleared after 30 days by the cron trigger; the row stays for counts.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- 'message' | 'reply' | 'hint' | 'solve' | 'blocked'
  text TEXT
);

CREATE INDEX events_ts ON events (ts);
