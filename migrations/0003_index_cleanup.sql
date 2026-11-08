-- Reads sort by spotted_at (idx_sightings_visible_spotted), so the created_at index is unused.
-- Rate limiting uses idx_sightings_ip_time. Dropping it saves a write on every insert.
DROP INDEX IF EXISTS idx_sightings_visible_time;

-- The leaderboard now groups nicknames case-insensitively, so index them that way.
DROP INDEX IF EXISTS idx_sightings_nickname;
CREATE INDEX idx_sightings_nickname_nocase ON sightings (nickname COLLATE NOCASE)
  WHERE hidden = 0 AND nickname IS NOT NULL;

-- Refresh the query planner statistics so it picks the new index (Cloudflare recommends this after creating indexes).
PRAGMA optimize;
