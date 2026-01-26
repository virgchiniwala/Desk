-- Migration 002: Add multi-provider AI support
-- Adds user model configurations and per-conversation model selection

-- User Model Configurations: Per-user provider/model settings
CREATE TABLE IF NOT EXISTS user_model_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK(provider IN ('anthropic', 'openai', 'ollama', 'claude-code')),
    model TEXT NOT NULL,
    config_json TEXT, -- Non-secret configuration (base URL, etc.)
    secret_encrypted BLOB, -- Encrypted API keys/secrets
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_model_configs_user_id ON user_model_configs(user_id);

-- Add model_ref column to conversations
-- NULL = use instance default
-- 'default' = explicitly use instance default
-- 'user' = use user's configured provider
ALTER TABLE conversations ADD COLUMN model_ref TEXT DEFAULT NULL;
