const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Database file location
const DB_PATH = path.join(__dirname, 'desk.db');

// Initialize database connection
const db = new Database(DB_PATH, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Run initialization SQL
const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
db.exec(initSql);

// Run all migration files
const migrationsDir = path.join(__dirname, 'migrations');
if (fs.existsSync(migrationsDir)) {
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(filename => filename.endsWith('.sql'))
    .sort();

  migrationFiles.forEach(filename => {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    db.exec(sqlContent);
    console.log(`  ✓ Migration applied: ${filename}`);
  });
}

console.log('✅ Database ready:', DB_PATH);

module.exports = db;
