-- Migration 001: Add chat tables for AI conversation interface
-- Adds support for multi-turn conversations with file attachments, job tracking,
-- task dependency graphs, lease-based worker ownership, and append-only event logs

-- Conversations: Top-level chat sessions
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Messages: Individual messages within conversations
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    tool_calls TEXT, -- JSON array of tool calls
    tool_results TEXT, -- JSON array of tool results
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Attachments: Files uploaded by users during conversations
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    message_id INTEGER, -- NULL if attached to conversation, not specific message
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_conversation_id ON attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

-- Conversation Jobs: Links conversations to Ralph jobs
CREATE TABLE IF NOT EXISTS conversation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    job_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE(conversation_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_jobs_conversation_id ON conversation_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_jobs_job_id ON conversation_jobs(job_id);

-- Tasks: Task dependency graph (replaces flat phase-based execution)
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    task_name TEXT NOT NULL,
    description TEXT,
    command TEXT NOT NULL,
    time_budget INTEGER DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),

    -- Lease-based ownership (not PID-based)
    lease_expires_at TEXT, -- ISO timestamp when lease expires
    last_heartbeat TEXT,   -- Worker extends this periodically

    -- Retry policy and tracking
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,

    -- Timing
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),

    UNIQUE(job_id, task_name)
);

CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(lease_expires_at);

-- Task Dependencies: Directed Acyclic Graph (DAG)
CREATE TABLE IF NOT EXISTS task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    blocked_by_task_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_by_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, blocked_by_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_blocked_by ON task_dependencies(blocked_by_task_id);

-- Task Artifacts: Outputs produced by tasks
CREATE TABLE IF NOT EXISTS task_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    filepath TEXT NOT NULL,
    artifact_type TEXT DEFAULT 'output' CHECK(artifact_type IN ('output', 'log', 'metadata')),
    file_size INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id ON task_artifacts(task_id);

-- Task Events: Append-only audit log (NEVER DELETE/UPDATE)
CREATE TABLE IF NOT EXISTS task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN (
        'TaskCreated', 'TaskStateChanged', 'TaskLeased', 'TaskHeartbeat',
        'TaskFailed', 'TaskRetried', 'TaskCompleted',
        'ToolCalled', 'ApprovalGranted', 'DependencyCreated', 'DependencySatisfied'
    )),
    event_data TEXT, -- JSON blob with event details
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_type ON task_events(event_type);
CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at DESC);
