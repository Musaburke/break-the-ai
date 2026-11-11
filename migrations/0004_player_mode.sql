-- Difficulty, chosen once when the run starts and fixed for the whole run. 'easy' shows each level's clue
-- and costs EASY_COST points per level (src/engine/score.ts).
ALTER TABLE players ADD COLUMN mode TEXT NOT NULL DEFAULT 'normal';
