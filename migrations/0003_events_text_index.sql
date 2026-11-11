-- Only rows that still hold text, so the daily clean-up reads just the rows it may wipe,
-- not every message older than 30 days.
CREATE INDEX events_text_ts ON events (ts) WHERE text IS NOT NULL;
