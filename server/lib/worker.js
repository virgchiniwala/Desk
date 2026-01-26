#!/usr/bin/env node

/**
 * Desk Task Worker - Database-driven task execution with lease-based locking
 *
 * Continuously polls database for READY tasks, claims them with leases,
 * executes commands, sends heartbeats, and updates status.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const TaskGraph = require('./task-graph');

// Configuration
const POLL_INTERVAL_MS = 10 * 1000; // 10 seconds
const LEASE_DURATION_MIN = 5; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

class Worker {
  constructor() {
    this.activeTasks = new Map(); // taskId -> { process, heartbeatInterval }
    this.running = true;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[Worker ${timestamp}] ${message}`);
  }

  async start() {
    this.log('Starting Desk Task Worker');
    this.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
    this.log(`Lease duration: ${LEASE_DURATION_MIN} minutes`);
    this.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL_MS}ms`);

    // Main loop
    while (this.running) {
      try {
        await this.pollAndExecute();
      } catch (error) {
        this.log(`Error in main loop: ${error.message}`);
      }

      // Sleep before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  async pollAndExecute() {
    this.log('Polling for READY tasks...');

    // Get next claimable task
    const task = TaskGraph.getNextReadyTask();

    if (!task) {
      this.log('No READY tasks found');
      return;
    }

    this.log(`Found task ${task.id}: ${task.task_name} (job: ${task.job_id})`);

    // Try to claim task
    try {
      const claimed = TaskGraph.claimTask(task.id, LEASE_DURATION_MIN);

      if (!claimed) {
        this.log(`Failed to claim task ${task.id} (already claimed)`);
        return;
      }

      this.log(`✓ Claimed task ${task.id}`);

      // Execute task in background (non-blocking)
      this.executeTask(task);

    } catch (error) {
      this.log(`Error claiming task ${task.id}: ${error.message}`);
    }
  }

  async executeTask(task) {
    this.log(`Executing task ${task.id}: ${task.command}`);

    try {
      // Validate command safety
      this.validateCommand(task.command);

      // Parse command into executable + args
      const commandParts = task.command.split(' ');
      const executable = commandParts[0];
      const args = commandParts.slice(1);

      // Determine working directory (job output directory)
      const workingDir = path.join(process.cwd(), '../jobs', task.job_id, 'output');

      // Ensure working directory exists
      if (!fs.existsSync(workingDir)) {
        fs.mkdirSync(workingDir, { recursive: true });
      }

      // Spawn process
      const childProcess = spawn(executable, args, {
        cwd: workingDir,
        shell: false, // Prevent shell injection
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Store active task
      this.activeTasks.set(task.id, { process: childProcess, heartbeatInterval: null });

      // Setup heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          TaskGraph.heartbeat(task.id, LEASE_DURATION_MIN);
          this.log(`Heartbeat sent for task ${task.id}`);
        } catch (error) {
          this.log(`Heartbeat failed for task ${task.id}: ${error.message}`);
        }
      }, HEARTBEAT_INTERVAL_MS);

      this.activeTasks.get(task.id).heartbeatInterval = heartbeatInterval;

      // Collect output
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        this.log(`[Task ${task.id}] ${data.toString().trim()}`);
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.log(`[Task ${task.id} ERROR] ${data.toString().trim()}`);
      });

      // Handle completion
      childProcess.on('exit', (code) => {
        // Clear heartbeat
        clearInterval(heartbeatInterval);
        this.activeTasks.delete(task.id);

        if (code === 0) {
          this.log(`✓ Task ${task.id} completed successfully`);

          try {
            TaskGraph.completeTask(task.id);
            this.log(`✓ Task ${task.id} marked COMPLETED`);
          } catch (error) {
            this.log(`Error marking task ${task.id} complete: ${error.message}`);
          }
        } else {
          this.log(`✗ Task ${task.id} failed with exit code ${code}`);

          const errorMessage = stderr || stdout || `Exit code ${code}`;

          try {
            TaskGraph.failTask(task.id, errorMessage);
            this.log(`✓ Task ${task.id} marked FAILED (retry logic applied)`);
          } catch (error) {
            this.log(`Error marking task ${task.id} failed: ${error.message}`);
          }
        }
      });

      childProcess.on('error', (error) => {
        this.log(`✗ Task ${task.id} process error: ${error.message}`);

        // Clear heartbeat
        clearInterval(heartbeatInterval);
        this.activeTasks.delete(task.id);

        try {
          TaskGraph.failTask(task.id, error.message);
        } catch (err) {
          this.log(`Error marking task ${task.id} failed: ${err.message}`);
        }
      });

    } catch (error) {
      this.log(`Error executing task ${task.id}: ${error.message}`);

      try {
        TaskGraph.failTask(task.id, error.message);
      } catch (err) {
        this.log(`Error marking task ${task.id} failed: ${err.message}`);
      }
    }
  }

  validateCommand(command) {
    // Block dangerous patterns
    const blockedPatterns = [
      /rm\s+-rf\s+\//,
      /curl.*\|\s*bash/,
      /\$\(.*\)/,
      /\.env/,
      /sudo/,
      /eval/
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Blocked dangerous command pattern: ${pattern}`);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.log('Stopping worker...');
    this.running = false;

    // Kill all active tasks
    for (const [taskId, { process, heartbeatInterval }] of this.activeTasks.entries()) {
      this.log(`Killing task ${taskId}`);
      clearInterval(heartbeatInterval);

      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
    }

    this.activeTasks.clear();
    this.log('Worker stopped');
  }
}

// Handle graceful shutdown
const worker = new Worker();

process.on('SIGTERM', () => {
  console.log('\n[Shutdown] SIGTERM received');
  worker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Shutdown] SIGINT received');
  worker.stop();
  process.exit(0);
});

// Start worker
worker.start().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
