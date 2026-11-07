CREATE TABLE sightings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  place_name  TEXT,
  activity    TEXT    NOT NULL,
  note        TEXT,
  nickname    TEXT,
  created_at  INTEGER NOT NULL,
  ip_hash     TEXT    NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sightings_visible_time ON sightings (hidden, created_at DESC);
CREATE INDEX idx_sightings_nickname     ON sightings (nickname) WHERE hidden = 0;
CREATE INDEX idx_sightings_ip_time      ON sightings (ip_hash, created_at);
