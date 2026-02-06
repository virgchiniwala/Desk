const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const db = require('../db/db');
const ARTIFACT_KEY_TTL_MS = 60 * 60 * 1000; // 1 hour
const ARTIFACT_KEY_MAX_SIZE = 10000;

/**
 * WorkerManager - Manages Ralph worker process and broadcasts task updates via SSE
 *
 * Responsibilities:
 * - Spawn ralph/worker.sh on server startup
 * - Monitor worker stdout for task status updates
 * - Parse updates and broadcast via Server-Sent Events
 * - Auto-restart on crash
 * - Graceful shutdown
 */
class WorkerManager extends EventEmitter {
  constructor() {
    super();
    this.workerProcess = null;
    this.isRunning = false;
    this.shouldRestart = true;
    this.sseClients = new Map(); // conversationId -> Set of response objects
    this.emittedArtifactKeys = new Map(); // artifactKey -> timestamp
  }

  /**
   * Start the Ralph worker
   */
  start() {
    if (this.isRunning) {
      console.log('[WorkerManager] Worker already running');
      return;
    }

    const workerPath = path.join(__dirname, 'worker.js');

    console.log('[WorkerManager] Starting Node.js task worker:', workerPath);

    this.workerProcess = spawn('node', [workerPath], {
      cwd: path.join(__dirname, '../..'),
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'development'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.isRunning = true;

    // Monitor stdout for task updates
    this.workerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Worker]', output.trim());

      // Parse task status updates
      this._parseWorkerOutput(output);
    });

    // Monitor stderr
    this.workerProcess.stderr.on('data', (data) => {
      console.error('[Worker Error]', data.toString().trim());
    });

    // Handle process exit
    this.workerProcess.on('exit', (code, signal) => {
      console.log(`[WorkerManager] Worker exited with code ${code}, signal ${signal}`);
      this.isRunning = false;

      // Auto-restart if not intentionally stopped
      if (this.shouldRestart) {
        console.log('[WorkerManager] Restarting worker in 5 seconds...');
        setTimeout(() => this.start(), 5000);
      }
    });

    // Handle process errors
    this.workerProcess.on('error', (error) => {
      console.error('[WorkerManager] Worker process error:', error);
      this.isRunning = false;
    });

    console.log('[WorkerManager] Worker started with PID:', this.workerProcess.pid);
  }

  /**
   * Stop the worker gracefully
   */
  stop() {
    console.log('[WorkerManager] Stopping worker...');
    this.shouldRestart = false;

    if (this.workerProcess && this.isRunning) {
      this.workerProcess.kill('SIGTERM');

      // Force kill after 10 seconds if not stopped
      setTimeout(() => {
        if (this.isRunning) {
          console.log('[WorkerManager] Force killing worker');
          this.workerProcess.kill('SIGKILL');
        }
      }, 10000);
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      running: this.isRunning,
      pid: this.workerProcess?.pid,
      connectedClients: Array.from(this.sseClients.keys()).length
    };
  }

  /**
   * Register SSE client for a conversation
   * @param {number} conversationId - Conversation ID
   * @param {Response} res - Express response object
   */
  registerSSEClient(conversationId, res) {
    if (!this.sseClients.has(conversationId)) {
      this.sseClients.set(conversationId, new Set());
    }

    this.sseClients.get(conversationId).add(res);

    console.log(`[WorkerManager] SSE client registered for conversation ${conversationId}`);

    // Setup cleanup on client disconnect
    res.on('close', () => {
      this._unregisterSSEClient(conversationId, res);
    });
  }

  /**
   * Unregister SSE client
   */
  _unregisterSSEClient(conversationId, res) {
    const clients = this.sseClients.get(conversationId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(conversationId);
      }
    }

    console.log(`[WorkerManager] SSE client unregistered for conversation ${conversationId}`);
  }

  /**
   * Send SSE event to conversation clients
   * @param {number} conversationId - Conversation ID
   * @param {string} eventType - Event type
   * @param {object} data - Event data
   */
  sendSSE(conversationId, eventType, data) {
    const clients = this.sseClients.get(conversationId);
    if (!clients || clients.size === 0) {
      return;
    }

    const sseData = JSON.stringify({ type: eventType, ...data });

    clients.forEach(res => {
      try {
        res.write(`data: ${sseData}\n\n`);
      } catch (error) {
        console.error('[WorkerManager] Error sending SSE:', error);
        this._unregisterSSEClient(conversationId, res);
      }
    });
  }

  /**
   * Send heartbeat to all connected clients
   */
  sendHeartbeat() {
    this.sseClients.forEach((clients, conversationId) => {
      clients.forEach(res => {
        try {
          res.write(':heartbeat\n\n');
        } catch (error) {
          this._unregisterSSEClient(conversationId, res);
        }
      });
    });
  }

  /**
   * Parse worker stdout for task status updates
   * Expected format: [TASK:42] STATUS:COMPLETED
   */
  _parseWorkerOutput(output) {
    const lines = output.split('\n');

    for (const line of lines) {
      const taskMatch = line.match(/\[TASK:(\d+)\]\s+STATUS:(\w+)/);

      if (taskMatch) {
        const taskId = parseInt(taskMatch[1]);
        const status = taskMatch[2];

        this._handleTaskUpdate(taskId, status);
      }
    }
  }

  /**
   * Handle task status update
   */
  _handleTaskUpdate(taskId, status) {
    try {
      // Get task and associated conversation
      const task = db.prepare(`
        SELECT t.*, cj.conversation_id
        FROM tasks t
        JOIN conversation_jobs cj ON t.job_id = cj.job_id
        WHERE t.id = ?
      `).get(taskId);

      if (!task) {
        console.warn(`[WorkerManager] Task ${taskId} not found`);
        return;
      }

      // Broadcast update to conversation
      this.sendSSE(task.conversation_id, 'task_update', {
        taskId,
        taskName: task.task_name,
        jobId: task.job_id,
        status,
        timestamp: new Date().toISOString()
      });

      // If task completed, check for new artifacts
      if (status === 'COMPLETED') {
        this._checkForArtifacts(task.job_id, task.conversation_id);
      }

      console.log(`[WorkerManager] Task ${taskId} (${task.task_name}) → ${status}`);
    } catch (error) {
      console.error('[WorkerManager] Error handling task update:', error);
    }
  }

  /**
   * Check for new artifacts and broadcast
   */
  _checkForArtifacts(jobId, conversationId) {
    try {
      const { listJobOutputFiles } = require('./job-reader');
      const files = listJobOutputFiles(jobId);

      if (files.length > 0) {
        this._pruneArtifactKeyCache();
        files.forEach(file => {
          const artifactKey = `${conversationId}:${jobId}:${file.relativePath}:${file.mtime}`;
          if (this.emittedArtifactKeys.has(artifactKey)) {
            return;
          }
          this.emittedArtifactKeys.set(artifactKey, Date.now());

          this.sendSSE(conversationId, 'artifact_ready', {
            jobId,
            filename: file.relativePath,
            size: file.size,
            path: `/artifacts/${jobId}/output/${file.relativePath.split('/').map(part => encodeURIComponent(part)).join('/')}`
          });
        });
      }
    } catch (error) {
      // Job output directory might not exist yet
      console.log(`[WorkerManager] No artifacts yet for job ${jobId}`);
    }
  }

  _pruneArtifactKeyCache() {
    const now = Date.now();

    // TTL-based pruning first.
    for (const [key, timestamp] of this.emittedArtifactKeys.entries()) {
      if (now - timestamp > ARTIFACT_KEY_TTL_MS) {
        this.emittedArtifactKeys.delete(key);
      }
    }

    // Size cap fallback (drop oldest entries).
    if (this.emittedArtifactKeys.size <= ARTIFACT_KEY_MAX_SIZE) {
      return;
    }

    const entries = Array.from(this.emittedArtifactKeys.entries())
      .sort((a, b) => a[1] - b[1]); // oldest first

    const overflow = this.emittedArtifactKeys.size - ARTIFACT_KEY_MAX_SIZE;
    for (let i = 0; i < overflow; i += 1) {
      this.emittedArtifactKeys.delete(entries[i][0]);
    }
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

// Singleton instance
const workerManager = new WorkerManager();

module.exports = workerManager;
