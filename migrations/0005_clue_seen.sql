-- The clue costs points on the levels where it was shown, not for a whole run, so a player can switch
-- difficulty any time. Levels already played on Easy count as clue seen.
ALTER TABLE progress ADD COLUMN clue_seen INTEGER NOT NULL DEFAULT 0;
UPDATE progress SET clue_seen = 1 WHERE player_id IN (SELECT id FROM players WHERE mode = 'easy');
