const db = require('../db/db');

/**
 * TaskGraph - Manages task dependency graphs with lease-based execution
 *
 * Features:
 * - Directed Acyclic Graph (DAG) for task dependencies
 * - Cycle detection to prevent deadlock
 * - Lease-based task ownership (not PID-based)
 * - Automatic lease expiry and recovery
 * - Retry policy with attempt tracking
 * - Append-only event log for audit trail
 */
class TaskGraph {
  /**
   * Create a new task with dependencies
   * @param {string} jobId - Job ID
   * @param {string} taskName - Unique task name
   * @param {string} command - Bash command to execute
   * @param {object} options - { description, timeBudget, blockedBy[], maxAttempts }
   * @returns {number} Task ID
   */
  static createTask(jobId, taskName, command, options = {}) {
    const {
      description = '',
      timeBudget = 30,
      blockedBy = [],
      maxAttempts = 3
    } = options;

    // Insert task
    const result = db.prepare(`
      INSERT INTO tasks (job_id, task_name, description, command, time_budget, max_attempts, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(jobId, taskName, description, command, timeBudget, maxAttempts);

    const taskId = result.lastInsertRowid;

    // Log task creation
    this._logEvent(taskId, 'TaskCreated', {
      taskName,
      command,
      timeBudget,
      blockedBy
    });

    // Add dependencies with cycle detection
    if (blockedBy.length > 0) {
      for (const blockerName of blockedBy) {
        const blocker = db.prepare(
          'SELECT id FROM tasks WHERE job_id = ? AND task_name = ?'
        ).get(jobId, blockerName);

        if (blocker) {
          this.addDependency(taskId, blocker.id);
        } else {
          throw new Error(`Blocking task "${blockerName}" not found`);
        }
      }
    } else {
      // No dependencies, task is READY immediately
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('READY', taskId);
      this._logEvent(taskId, 'TaskStateChanged', { from: 'PENDING', to: 'READY' });
    }

    return taskId;
  }

  /**
   * Add dependency with cycle detection
   * @param {number} taskId - Task that is blocked
   * @param {number} blockedByTaskId - Task that must complete first
   */
  static addDependency(taskId, blockedByTaskId) {
    // Insert dependency
    db.prepare(
      'INSERT INTO task_dependencies (task_id, blocked_by_task_id) VALUES (?, ?)'
    ).run(taskId, blockedByTaskId);

    // Check for cycles
    if (this._hasCycle(taskId)) {
      // Rollback - would create cycle
      db.prepare(
        'DELETE FROM task_dependencies WHERE task_id = ? AND blocked_by_task_id = ?'
      ).run(taskId, blockedByTaskId);

      throw new Error(`Cannot add dependency: would create cycle in task graph`);
    }

    // Log dependency creation
    this._logEvent(taskId, 'DependencyCreated', {
      blockedByTaskId
    });
  }

  /**
   * Get tasks that are READY to execute (lease available or expired)
   * @param {string} jobId - Optional job ID filter
   * @returns {Array} Ready tasks
   */
  static getReadyTasks(jobId = null) {
    let query = `
      SELECT t.*
      FROM tasks t
      WHERE t.status = 'READY'
        AND (t.lease_expires_at IS NULL OR t.lease_expires_at < datetime('now'))
        AND NOT EXISTS (
          SELECT 1
          FROM task_dependencies td
          JOIN tasks blocked ON td.blocked_by_task_id = blocked.id
          WHERE td.task_id = t.id
            AND blocked.status != 'COMPLETED'
        )
    `;

    if (jobId) {
      query += ` AND t.job_id = ?`;
      return db.prepare(query).all(jobId);
    }

    return db.prepare(query).all();
  }

  /**
   * Claim a task with lease (atomic operation)
   * @param {number} taskId - Task to claim
   * @param {number} leaseDurationMinutes - Lease duration (default 5)
   * @returns {boolean} Success
   */
  static claimTask(taskId, leaseDurationMinutes = 5) {
    const result = db.prepare(`
      UPDATE tasks
      SET status = 'IN_PROGRESS',
          lease_expires_at = datetime('now', '+${leaseDurationMinutes} minutes'),
          last_heartbeat = datetime('now'),
          attempt_count = attempt_count + 1,
          started_at = CASE WHEN started_at IS NULL THEN datetime('now') ELSE started_at END
      WHERE id = ?
        AND status = 'READY'
        AND (lease_expires_at IS NULL OR lease_expires_at < datetime('now'))
    `).run(taskId);

    if (result.changes > 0) {
      this._logEvent(taskId, 'TaskLeased', {
        leaseDurationMinutes,
        attemptNumber: this._getAttemptCount(taskId)
      });

      this._logEvent(taskId, 'TaskStateChanged', {
        from: 'READY',
        to: 'IN_PROGRESS'
      });

      return true;
    }

    return false;
  }

  /**
   * Extend lease (heartbeat)
   * @param {number} taskId - Task ID
   * @param {number} leaseDurationMinutes - Lease extension (default 5)
   */
  static heartbeat(taskId, leaseDurationMinutes = 5) {
    db.prepare(`
      UPDATE tasks
      SET lease_expires_at = datetime('now', '+${leaseDurationMinutes} minutes'),
          last_heartbeat = datetime('now')
      WHERE id = ?
        AND status = 'IN_PROGRESS'
    `).run(taskId);

    this._logEvent(taskId, 'TaskHeartbeat', {
      extendedBy: leaseDurationMinutes
    });
  }

  /**
   * Complete task successfully
   * @param {number} taskId - Task ID
   */
  static completeTask(taskId) {
    db.prepare(`
      UPDATE tasks
      SET status = 'COMPLETED',
          lease_expires_at = NULL,
          completed_at = datetime('now')
      WHERE id = ?
    `).run(taskId);

    this._logEvent(taskId, 'TaskCompleted', {
      attemptNumber: this._getAttemptCount(taskId)
    });

    this._logEvent(taskId, 'TaskStateChanged', {
      from: 'IN_PROGRESS',
      to: 'COMPLETED'
    });

    // Update dependent tasks to READY if all their dependencies are now complete
    this._updateDependentTasks(taskId);
  }

  /**
   * Fail task and handle retry logic
   * @param {number} taskId - Task ID
   * @param {string} errorMessage - Error details
   */
  static failTask(taskId, errorMessage) {
    const task = db.prepare('SELECT attempt_count, max_attempts FROM tasks WHERE id = ?').get(taskId);

    if (task.attempt_count < task.max_attempts) {
      // Retry - reset to READY
      db.prepare(`
        UPDATE tasks
        SET status = 'READY',
            lease_expires_at = NULL,
            last_error = ?
        WHERE id = ?
      `).run(errorMessage, taskId);

      this._logEvent(taskId, 'TaskRetried', {
        attemptNumber: task.attempt_count,
        error: errorMessage,
        willRetry: true
      });

      this._logEvent(taskId, 'TaskStateChanged', {
        from: 'IN_PROGRESS',
        to: 'READY',
        reason: 'retry'
      });
    } else {
      // Max attempts reached, mark as FAILED
      db.prepare(`
        UPDATE tasks
        SET status = 'FAILED',
            lease_expires_at = NULL,
            last_error = ?,
            completed_at = datetime('now')
        WHERE id = ?
      `).run(errorMessage, taskId);

      this._logEvent(taskId, 'TaskFailed', {
        attemptNumber: task.attempt_count,
        error: errorMessage,
        maxAttemptsReached: true
      });

      this._logEvent(taskId, 'TaskStateChanged', {
        from: 'IN_PROGRESS',
        to: 'FAILED',
        reason: 'max_attempts_reached'
      });
    }
  }

  /**
   * Get dependency graph for visualization
   * @param {string} jobId - Job ID
   * @returns {object} { tasks, dependencies }
   */
  static getDependencyGraph(jobId) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE job_id = ? ORDER BY created_at ASC').all(jobId);

    const dependencies = db.prepare(`
      SELECT
        td.task_id,
        td.blocked_by_task_id,
        t1.task_name,
        t2.task_name as blocked_by_name
      FROM task_dependencies td
      JOIN tasks t1 ON td.task_id = t1.id
      JOIN tasks t2 ON td.blocked_by_task_id = t2.id
      WHERE t1.job_id = ?
    `).all(jobId);

    return { tasks, dependencies };
  }

  /**
   * Get task events (audit trail)
   * @param {number} taskId - Task ID
   * @returns {Array} Events
   */
  static getTaskEvents(taskId) {
    return db.prepare(`
      SELECT * FROM task_events
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId);
  }

  /**
   * Release expired leases (automatic recovery)
   * @returns {number} Number of tasks released
   */
  static releaseExpiredLeases() {
    const result = db.prepare(`
      UPDATE tasks
      SET status = 'READY',
          lease_expires_at = NULL
      WHERE status = 'IN_PROGRESS'
        AND lease_expires_at < datetime('now')
    `).run();

    if (result.changes > 0) {
      const releasedTasks = db.prepare(`
        SELECT id FROM tasks
        WHERE status = 'READY'
          AND last_heartbeat < datetime('now', '-10 minutes')
        LIMIT ?
      `).all(result.changes);

      releasedTasks.forEach(task => {
        this._logEvent(task.id, 'TaskStateChanged', {
          from: 'IN_PROGRESS',
          to: 'READY',
          reason: 'lease_expired'
        });
      });
    }

    return result.changes;
  }

  // Private helper methods

  static _hasCycle(taskId, visitedSet = new Set(), recursionStack = new Set()) {
    if (recursionStack.has(taskId)) return true;
    if (visitedSet.has(taskId)) return false;

    visitedSet.add(taskId);
    recursionStack.add(taskId);

    const dependencies = db.prepare(
      'SELECT blocked_by_task_id FROM task_dependencies WHERE task_id = ?'
    ).all(taskId);

    for (const dep of dependencies) {
      if (this._hasCycle(dep.blocked_by_task_id, visitedSet, recursionStack)) {
        return true;
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  static _updateDependentTasks(completedTaskId) {
    // Find tasks that were blocked by this task
    const nowUnblocked = db.prepare(`
      SELECT DISTINCT t.id
      FROM tasks t
      JOIN task_dependencies td ON t.id = td.task_id
      WHERE td.blocked_by_task_id = ?
        AND t.status = 'PENDING'
    `).all(completedTaskId);

    // Check if each is now ready (all dependencies satisfied)
    nowUnblocked.forEach(task => {
      if (this._isTaskReady(task.id)) {
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('READY', task.id);

        this._logEvent(task.id, 'DependencySatisfied', {
          unblocked_by: completedTaskId
        });

        this._logEvent(task.id, 'TaskStateChanged', {
          from: 'PENDING',
          to: 'READY',
          reason: 'dependencies_satisfied'
        });
      }
    });
  }

  static _isTaskReady(taskId) {
    const blockers = db.prepare(`
      SELECT blocked.id, blocked.status
      FROM task_dependencies td
      JOIN tasks blocked ON td.blocked_by_task_id = blocked.id
      WHERE td.task_id = ?
        AND blocked.status != 'COMPLETED'
    `).all(taskId);

    return blockers.length === 0;
  }

  static _logEvent(taskId, eventType, eventData) {
    db.prepare(`
      INSERT INTO task_events (task_id, event_type, event_data)
      VALUES (?, ?, ?)
    `).run(taskId, eventType, JSON.stringify(eventData));
  }

  static _getAttemptCount(taskId) {
    const task = db.prepare('SELECT attempt_count FROM tasks WHERE id = ?').get(taskId);
    return task ? task.attempt_count : 0;
  }
}

module.exports = TaskGraph;
