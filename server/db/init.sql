-- Desk Platform MVP Database Schema
-- SQLite database for user authentication and sessions

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('officer', 'supervisor')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions table (managed by connect-sqlite3)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

-- Create index on sessions.expired for efficient cleanup
CREATE INDEX IF NOT EXISTS IDX_sessions_expired ON sessions(expired);

-- Insert default supervisor user (password: admin123)
-- Password hash generated with: bcryptjs.hashSync('admin123', 10)
INSERT OR IGNORE INTO users (username, password_hash, role)
VALUES ('admin', '$2a$10$YmVkMWM0NTM3OTYwNGFmNO8xNzYwNDM5ZjQ1YmY2ZWZjZjQ5ZjZlZj', 'supervisor');
