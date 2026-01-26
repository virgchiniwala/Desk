
---

## CRITICAL ADDITION: Task Dependency Graph

### Task 13: Implement Dependency Graph for Tasks

**Architecture Change:** Replace flat phase checklist (RESEARCH → PLAN → ...) with explicit dependency graph. Tasks/Steps are first-class objects with `blockedBy` relationships. Workers enforce: can only execute tasks where all dependencies are satisfied.

**Files:**
- Create: `server/db/migrations/003-task-dependency-graph.sql`
- Modify: `server/lib/ai-agent.js` (update tools to create tasks with dependencies)
- Modify: `ralph/worker.sh` (update to check task dependencies)
- Create: `server/lib/task-graph.js` (dependency resolution logic)

---

**Step 1: Create task dependency schema**

```sql
-- Tasks table (replaces implicit phases)
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    task_name TEXT NOT NULL,
    description TEXT,
    command TEXT NOT NULL,
    time_budget INTEGER DEFAULT 30,
    status TEXT DEFAULT 'PENDING', -- PENDING/READY/IN_PROGRESS/COMPLETED/FAILED
    owner_worker TEXT, -- Worker PID that picked up task
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES conversation_jobs(job_id)
);

-- Task dependencies (directed acyclic graph)
CREATE TABLE IF NOT EXISTS task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    blocked_by_task_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (blocked_by_task_id) REFERENCES tasks(id),
    UNIQUE(task_id, blocked_by_task_id)
);

-- Task artifacts (outputs produced)
CREATE TABLE IF NOT EXISTS task_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    filepath TEXT NOT NULL,
    artifact_type TEXT, -- output/log/metadata
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_blocked_by ON task_dependencies(blocked_by_task_id);
CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id ON task_artifacts(task_id);
```

**Step 2: Create dependency graph resolver**

```javascript
// server/lib/task-graph.js
const db = require('../db/db');

class TaskGraph {
  // Get all tasks that are ready to execute (unblocked)
  static getReadyTasks(jobId) {
    const tasks = db.prepare(`
      SELECT t.* 
      FROM tasks t
      WHERE t.job_id = ?
        AND t.status = 'PENDING'
        AND NOT EXISTS (
          SELECT 1 
          FROM task_dependencies td
          JOIN tasks blocked ON td.blocked_by_task_id = blocked.id
          WHERE td.task_id = t.id
            AND blocked.status != 'COMPLETED'
        )
    `).all(jobId);

    // Update status to READY
    tasks.forEach(task => {
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?')
        .run('READY', task.id);
    });

    return tasks;
  }

  // Check if a task is ready (all dependencies satisfied)
  static isTaskReady(taskId) {
    const blockers = db.prepare(`
      SELECT blocked.id, blocked.status
      FROM task_dependencies td
      JOIN tasks blocked ON td.blocked_by_task_id = blocked.id
      WHERE td.task_id = ?
        AND blocked.status != 'COMPLETED'
    `).all(taskId);

    return blockers.length === 0;
  }

  // Mark task as in progress
  static startTask(taskId, workerPid) {
    db.prepare(`
      UPDATE tasks 
      SET status = 'IN_PROGRESS',
          owner_worker = ?,
          started_at = datetime('now')
      WHERE id = ?
    `).run(workerPid, taskId);
  }

  // Mark task as completed
  static completeTask(taskId) {
    db.prepare(`
      UPDATE tasks 
      SET status = 'COMPLETED',
          completed_at = datetime('now')
      WHERE id = ?
    `).run(taskId);

    // Update dependent tasks to READY if all their dependencies are now complete
    this.updateReadyTasks(taskId);
  }

  // Mark task as failed
  static failTask(taskId, error) {
    db.prepare(`
      UPDATE tasks 
      SET status = 'FAILED'
      WHERE id = ?
    `).run(taskId);
  }

  // Get dependency graph for visualization
  static getDependencyGraph(jobId) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE job_id = ?').all(jobId);
    
    const dependencies = db.prepare(`
      SELECT td.task_id, td.blocked_by_task_id, t1.task_name, t2.task_name as blocked_by_name
      FROM task_dependencies td
      JOIN tasks t1 ON td.task_id = t1.id
      JOIN tasks t2 ON td.blocked_by_task_id = t2.id
      WHERE t1.job_id = ?
    `).all(jobId);

    return { tasks, dependencies };
  }

  // Detect cycles in dependency graph (prevent deadlock)
  static hasCycle(taskId, visitedSet = new Set(), recursionStack = new Set()) {
    if (recursionStack.has(taskId)) return true;
    if (visitedSet.has(taskId)) return false;

    visitedSet.add(taskId);
    recursionStack.add(taskId);

    const dependencies = db.prepare(
      'SELECT blocked_by_task_id FROM task_dependencies WHERE task_id = ?'
    ).all(taskId);

    for (const dep of dependencies) {
      if (this.hasCycle(dep.blocked_by_task_id, visitedSet, recursionStack)) {
        return true;
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  // Add dependency with cycle detection
  static addDependency(taskId, blockedByTaskId) {
    // Check for cycle before adding
    const tempRow = db.prepare(
      'INSERT INTO task_dependencies (task_id, blocked_by_task_id) VALUES (?, ?)'
    ).run(taskId, blockedByTaskId);

    if (this.hasCycle(taskId)) {
      // Rollback - would create cycle
      db.prepare('DELETE FROM task_dependencies WHERE id = ?').run(tempRow.lastInsertRowid);
      throw new Error('Dependency would create cycle in task graph');
    }
  }

  // Update ready tasks after a task completes
  static updateReadyTasks(completedTaskId) {
    // Find tasks that were blocked by this task
    const nowUnblocked = db.prepare(`
      SELECT DISTINCT t.id, t.job_id
      FROM tasks t
      JOIN task_dependencies td ON t.id = td.task_id
      WHERE td.blocked_by_task_id = ?
        AND t.status = 'PENDING'
    `).all(completedTaskId);

    // Check if each is now ready
    nowUnblocked.forEach(task => {
      if (this.isTaskReady(task.id)) {
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('READY', task.id);
      }
    });
  }
}

module.exports = TaskGraph;
```

**Step 3: Update AI agent to use task graph**

Modify `server/lib/ai-agent.js` to replace `enqueue_phase` tool with `create_task`:

```javascript
// Replace enqueue_phase tool with:
{
  name: 'create_task',
  description: 'Create a task with explicit dependencies',
  input_schema: {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: 'Job ID' },
      taskName: { type: 'string', description: 'Descriptive task name (e.g., "analyze_data", "generate_report")' },
      description: { type: 'string', description: 'What this task does' },
      command: { type: 'string', description: 'Bash command to execute' },
      timeBudget: { type: 'number', description: 'Minutes allowed (default 30)' },
      blockedBy: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Array of task names this task depends on (must complete first)'
      }
    },
    required: ['jobId', 'taskName', 'command']
  }
}

// In executeTool:
case 'create_task':
  this.validateCommand(toolInput.command);

  // Insert task
  const taskResult = db.prepare(`
    INSERT INTO tasks (job_id, task_name, description, command, time_budget, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(
    toolInput.jobId,
    toolInput.taskName,
    toolInput.description || '',
    toolInput.command,
    toolInput.timeBudget || 30
  );

  const taskId = taskResult.lastInsertRowid;

  // Add dependencies
  if (toolInput.blockedBy && toolInput.blockedBy.length > 0) {
    for (const blockerName of toolInput.blockedBy) {
      const blocker = db.prepare(
        'SELECT id FROM tasks WHERE job_id = ? AND task_name = ?'
      ).get(toolInput.jobId, blockerName);

      if (blocker) {
        TaskGraph.addDependency(taskId, blocker.id);
      }
    }
  }

  // Mark as READY if no dependencies
  if (!toolInput.blockedBy || toolInput.blockedBy.length === 0) {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('READY', taskId);
  }

  return {
    success: true,
    taskId,
    message: `Task ${toolInput.taskName} created`
  };
```

**Step 4: Update worker.sh to use task graph**

Modify `ralph/worker.sh` to query for READY tasks instead of sequential phases:

```bash
# Replace the phase-based queue scanning with task graph query

get_next_ready_task() {
  local job_id="$1"
  
  # Query for READY tasks (dependencies satisfied, not yet claimed)
  sqlite3 "${DB_PATH}" <<SQL
    SELECT id, task_name, command, time_budget
    FROM tasks
    WHERE job_id = '${job_id}'
      AND status = 'READY'
      AND owner_worker IS NULL
    LIMIT 1;
SQL
}

claim_task() {
  local task_id="$1"
  local worker_pid="$$"
  
  sqlite3 "${DB_PATH}" <<SQL
    UPDATE tasks
    SET status = 'IN_PROGRESS',
        owner_worker = '${worker_pid}',
        started_at = datetime('now')
    WHERE id = ${task_id}
      AND status = 'READY';
SQL
}

complete_task() {
  local task_id="$1"
  
  sqlite3 "${DB_PATH}" <<SQL
    UPDATE tasks
    SET status = 'COMPLETED',
        completed_at = datetime('now')
    WHERE id = ${task_id};
SQL
  
  # Log for SSE broadcast
  echo "[TASK:${task_id}] STATUS:COMPLETED"
}

# Main worker loop
while true; do
  # Get all jobs
  jobs=$(sqlite3 "${DB_PATH}" "SELECT DISTINCT job_id FROM tasks WHERE status IN ('PENDING', 'READY')")
  
  for job_id in $jobs; do
    # Get next ready task
    task=$(get_next_ready_task "$job_id")
    
    if [[ -n "$task" ]]; then
      task_id=$(echo "$task" | cut -d'|' -f1)
      task_name=$(echo "$task" | cut -d'|' -f2)
      command=$(echo "$task" | cut -d'|' -f3)
      time_budget=$(echo "$task" | cut -d'|' -f4)
      
      # Claim task
      claim_task "$task_id"
      
      # Execute
      echo "[TASK:${task_id}] STATUS:IN_PROGRESS"
      
      if timeout "${time_budget}m" bash -c "$command"; then
        complete_task "$task_id"
      else
        fail_task "$task_id"
        echo "[TASK:${task_id}] STATUS:FAILED"
      fi
    fi
  done
  
  sleep 10
done
```

**Step 5: Update UI to show dependency graph**

Modify task panel in `chat.ejs` to show dependencies:

```javascript
// In chat-client.js, replace flat phase list with dependency graph visualization

createTaskCard(jobId) {
  fetch(`/api/jobs/${jobId}/graph`)
    .then(res => res.json())
    .then(graph => {
      const taskCard = document.createElement('div');
      taskCard.className = 'task-card';
      taskCard.innerHTML = `
        <div class="task-header"><strong>${jobId}</strong></div>
        <div class="task-graph">
          ${this.renderGraph(graph.tasks, graph.dependencies)}
        </div>
      `;
      this.tasksContainer.appendChild(taskCard);
    });
}

renderGraph(tasks, dependencies) {
  // Simple list view with indentation for dependencies
  return tasks.map(task => {
    const blockers = dependencies
      .filter(d => d.task_id === task.id)
      .map(d => d.blocked_by_name);
    
    const icon = task.status === 'COMPLETED' ? '✓' :
                 task.status === 'IN_PROGRESS' ? '▶' :
                 task.status === 'READY' ? '⚡' : '☐';
    
    const blockedText = blockers.length > 0 
      ? `<span class="blocked-by">Depends on: ${blockers.join(', ')}</span>`
      : '';
    
    return `
      <div class="task-item status-${task.status}">
        <span class="task-icon">${icon}</span>
        <span class="task-name">${task.task_name}</span>
        ${blockedText}
      </div>
    `;
  }).join('');
}
```

**Step 6: Update system prompt**

Modify `server/lib/ai-agent-prompt.js` to teach AI about dependency graph:

```javascript
// Add to tool documentation:

### create_task (replaces enqueue_phase)
**Purpose:** Create a task with explicit dependencies
**When to use:** After creating a job, for each unit of work
**Required parameters:**
  - jobId: The job ID
  - taskName: Unique name (e.g., "fetch_data", "analyze_results")
  - command: Bash command to execute
  - description: What this task does
  - blockedBy: Array of task names that must complete first
  - timeBudget: Minutes (default 30)

**Dependency Rules:**
- Tasks with NO dependencies start immediately (status: READY)
- Tasks WITH dependencies wait until all blockers complete
- Worker enforces: only READY tasks execute
- Prevents race conditions automatically

**Example: Data pipeline**
{
  "jobId": "PROJECT-001",
  "taskName": "fetch_data",
  "command": "curl https://api/data > jobs/PROJECT-001/inputs/data.json",
  "description": "Download data from API",
  "blockedBy": [], // No dependencies, runs immediately
  "timeBudget": 10
}

{
  "jobId": "PROJECT-001",
  "taskName": "analyze_data",
  "command": "python analyze.py jobs/PROJECT-001/inputs/data.json",
  "description": "Run analysis on downloaded data",
  "blockedBy": ["fetch_data"], // Must wait for fetch_data to complete
  "timeBudget": 30
}

{
  "jobId": "PROJECT-001",
  "taskName": "generate_report",
  "command": "python report.py jobs/PROJECT-001/output/",
  "description": "Create final report",
  "blockedBy": ["analyze_data"], // Waits for analysis
  "timeBudget": 15
}

**Parallel execution example:**
{
  "jobId": "PROJECT-002",
  "taskName": "process_images_batch_1",
  "command": "python process.py batch1/",
  "blockedBy": [],
  "timeBudget": 20
}

{
  "jobId": "PROJECT-002",
  "taskName": "process_images_batch_2",
  "command": "python process.py batch2/",
  "blockedBy": [], // Runs in parallel with batch_1
  "timeBudget": 20
}

{
  "jobId": "PROJECT-002",
  "taskName": "merge_results",
  "command": "python merge.py",
  "blockedBy": ["process_images_batch_1", "process_images_batch_2"], // Waits for both
  "timeBudget": 10
}
```

**Step 7: Add API endpoint for dependency graph**

Create `server/routes/api.js`:

```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const TaskGraph = require('../lib/task-graph');

const router = express.Router();

// GET /api/jobs/:id/graph - Get dependency graph
router.get('/jobs/:id/graph', requireAuth, (req, res) => {
  const { id } = req.params;
  
  try {
    const graph = TaskGraph.getDependencyGraph(id);
    res.json(graph);
  } catch (error) {
    console.error('Error getting task graph:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

Register in `server.js`:
```javascript
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
```

**Step 8: Commit**

```bash
git add server/db/migrations/003-task-dependency-graph.sql \
        server/lib/task-graph.js \
        server/lib/ai-agent.js \
        server/lib/ai-agent-prompt.js \
        server/routes/api.js \
        server/public/js/chat-client.js \
        ralph/worker.sh
        
git commit -m "feat(core): implement task dependency graph with enforced execution order

- Replace flat phase checklist with explicit dependency graph
- Tasks have blockedBy relationships (DAG)
- Workers only execute READY tasks (dependencies satisfied)
- Prevents race conditions (#3 can't start before #1/#2)
- Enables parallel execution of independent tasks
- Cycle detection prevents deadlock
- UI shows task dependencies and status"
```

---

## Benefits of Dependency Graph

1. **Prevents Race Conditions:** Worker can't execute task #3 until #1 and #2 complete
2. **Enables Parallelism:** Independent tasks run simultaneously
3. **Explicit Dependencies:** No implicit assumptions about order
4. **Scalable:** Add more workers → more parallel execution
5. **Debuggable:** See exactly what's blocking each task
6. **Flexible:** AI can create complex workflows (pipelines, fan-out/fan-in, etc.)

## Example Workflows

**Sequential Pipeline:**
```
fetch_data → analyze_data → generate_report
```

**Parallel Processing:**
```
        ┌→ process_batch_1 ┐
start → ├→ process_batch_2 ├→ merge_results → finalize
        └→ process_batch_3 ┘
```

**Complex DAG:**
```
          ┌→ validate_schema ────┐
fetch → ──┤                       ├→ analyze → report
          └→ transform_data ──────┘
```

