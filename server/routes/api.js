const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const TaskGraph = require('../lib/task-graph');
const { listJobOutputFiles } = require('../lib/job-reader');
const db = require('../db/db');

const router = express.Router();

// GET /api/conversations - List user's conversations
router.get('/conversations', requireAuth, (req, res) => {
  try {
    const conversations = db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `).all(req.session.user.id);

    res.json({ conversations });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/conversations/:id/jobs - Get jobs for conversation
router.get('/conversations/:id/jobs', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    // Verify conversation ownership
    const conversation = db.prepare(`
      SELECT * FROM conversations
      WHERE id = ? AND user_id = ?
    `).get(id, req.session.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get jobs
    const jobs = db.prepare(`
      SELECT job_id, created_at
      FROM conversation_jobs
      WHERE conversation_id = ?
      ORDER BY created_at DESC
    `).all(id);

    res.json({ jobs });
  } catch (error) {
    console.error('Error getting conversation jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// GET /api/jobs/:id/graph - Get task dependency graph
router.get('/jobs/:id/graph', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    // Get dependency graph
    const graph = TaskGraph.getDependencyGraph(id);

    res.json(graph);
  } catch (error) {
    console.error('Error getting task graph:', error);
    res.status(500).json({ error: 'Failed to get task graph' });
  }
});

// GET /api/jobs/:id/artifacts - List job artifacts
router.get('/jobs/:id/artifacts', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const files = listJobOutputFiles(id);

    const artifacts = files.map(file => ({
      filename: file.name,
      size: file.size,
      path: `/artifacts/${id}/${file.name}`,
      modified: file.mtime
    }));

    res.json({ jobId: id, artifacts });
  } catch (error) {
    // Job output directory might not exist yet
    res.json({ jobId: id, artifacts: [] });
  }
});

// GET /api/tasks/:id/events - Get task event log (audit trail)
router.get('/tasks/:id/events', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const events = TaskGraph.getTaskEvents(parseInt(id));

    res.json({ taskId: id, events });
  } catch (error) {
    console.error('Error getting task events:', error);
    res.status(500).json({ error: 'Failed to get task events' });
  }
});

// GET /api/worker/status - Get worker status
router.get('/worker/status', requireAuth, (req, res) => {
  const workerManager = require('../lib/worker-manager');
  const status = workerManager.getStatus();

  res.json(status);
});

// GET /artifacts/:jobId/:filename - Download artifact
router.get('/artifacts/:jobId/:filename', requireAuth, (req, res) => {
  const { jobId, filename } = req.params;

  try {
    // Validate job ID format (security)
    if (!/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    // Sanitize filename (security)
    const safeName = path.basename(filename);

    const filePath = path.join(__dirname, '../../jobs', jobId, 'output', safeName);

    // Verify path is within job output directory (security)
    const resolvedPath = path.resolve(filePath);
    const jobOutputPath = path.resolve(path.join(__dirname, '../../jobs', jobId, 'output'));

    if (!resolvedPath.startsWith(jobOutputPath + path.sep)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Stream file download
    res.download(resolvedPath, safeName);
  } catch (error) {
    console.error('Error downloading artifact:', error);
    res.status(500).json({ error: 'Failed to download artifact' });
  }
});

module.exports = router;
