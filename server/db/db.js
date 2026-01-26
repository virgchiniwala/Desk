const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Database file location
const DB_PATH = path.join(__dirname, 'desk.db');

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Create migrations tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS applied_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`);

// Run initialization SQL
const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
db.exec(initSql);

// Run all migration files that haven't been applied yet
const migrationsDir = path.join(__dirname, 'migrations');
if (fs.existsSync(migrationsDir)) {
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(filename => filename.endsWith('.sql'))
    .sort();

  migrationFiles.forEach(filename => {
    // Check if migration already applied
    const alreadyApplied = db.prepare(
      'SELECT filename FROM applied_migrations WHERE filename = ?'
    ).get(filename);

    if (!alreadyApplied) {
      const sqlContent = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      db.exec(sqlContent);

      // Record that this migration has been applied
      db.prepare('INSERT INTO applied_migrations (filename) VALUES (?)').run(filename);
      console.log(`  ✓ Migration applied: ${filename}`);
    }
  });
}

console.log('✅ Database ready:', DB_PATH);

module.exports = db;
