-- New runs started per visitor per day, so one person can't empty the daily pool alone.
-- `visitor` is an HMAC of the IP address keyed with the day, never the address itself,
-- and rows are deleted the next day by the scheduled clean-up.
CREATE TABLE run_starts (
  date TEXT NOT NULL,
  visitor TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, visitor)
);
