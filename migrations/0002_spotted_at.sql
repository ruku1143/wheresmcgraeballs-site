-- When the sighting happened (user supplied, never in the future). created_at stays the insert time (used for rate limiting).
ALTER TABLE sightings ADD COLUMN spotted_at INTEGER NOT NULL DEFAULT 0;
UPDATE sightings SET spotted_at = created_at;
CREATE INDEX idx_sightings_visible_spotted ON sightings (hidden, spotted_at DESC);
