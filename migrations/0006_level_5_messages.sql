-- Level 5 adds 15 messages to a run (60 to 75). Players who started before it shipped get them too,
-- so an existing run can still reach level 5. Apply right before the deploy that ships level 5.
UPDATE players SET messages_left = messages_left + 15;
