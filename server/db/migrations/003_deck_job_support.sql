-- Migration 003: Deck workflow support hardening
-- Ensure task artifacts are deduplicated per task/file path

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_artifacts_task_path
ON task_artifacts(task_id, filepath);
