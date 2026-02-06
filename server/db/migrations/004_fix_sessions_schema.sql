-- Migration 004: Fix sessions table column order for connect-sqlite3
-- connect-sqlite3 inserts positional values as (sid, expired, sess)
-- and fails if sessions table is defined as (sid, sess, expired).

DROP INDEX IF EXISTS IDX_sessions_expired;

ALTER TABLE sessions RENAME TO sessions_old;

CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    expired INTEGER NOT NULL,
    sess TEXT NOT NULL
);

INSERT INTO sessions (sid, expired, sess)
SELECT
    sid,
    CASE
      WHEN typeof(sess) = 'integer' THEN sess
      WHEN typeof(sess) = 'text' AND sess GLOB '[0-9]*' THEN CAST(sess AS INTEGER)
      ELSE 0
    END AS expired,
    CASE
      WHEN typeof(expired) = 'text' THEN expired
      ELSE '{}'
    END AS sess
FROM sessions_old;

DROP TABLE sessions_old;

CREATE INDEX IF NOT EXISTS IDX_sessions_expired ON sessions(expired);
