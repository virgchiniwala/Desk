const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const AIAgent = require('../lib/ai-agent');
const workerManager = require('../lib/worker-manager');
const db = require('../db/db');
const {
  isUserOverridesAllowed,
  getUserModelConfig,
  getInstanceDefaultInfo
} = require('../lib/ai/provider-manager');

const router = express.Router();
const aiAgent = new AIAgent();

function sanitizeForJobInputs(name = '') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

function isDeckCsv(name = '') {
  return name.toLowerCase().endsWith('.csv');
}

function isDeckPptx(name = '') {
  return name.toLowerCase().endsWith('.pptx');
}

function getDeckAttachments(conversationId) {
  const attachments = db.prepare(`
    SELECT id, original_name, created_at
    FROM attachments
    WHERE conversation_id = ?
    ORDER BY created_at DESC
  `).all(conversationId);

  const csv = attachments.find(a => isDeckCsv(a.original_name));
  const pptx = attachments.find(a => isDeckPptx(a.original_name));

  return { csv, pptx };
}

function nextDeckJobId() {
  const rows = db.prepare(`
    SELECT job_id FROM conversation_jobs WHERE job_id LIKE 'DECK-%'
    UNION
    SELECT job_id FROM tasks WHERE job_id LIKE 'DECK-%'
  `).all();

  let maxNum = 100;
  rows.forEach(row => {
    const match = row.job_id.match(/^DECK-(\d{3})$/);
    if (!match) return;
    maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });

  return `DECK-${String(maxNum + 1).padStart(3, '0')}`;
}

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const conversationId = req.params.id || 'temp';
    const uploadDir = path.join(__dirname, '../../uploads', conversationId.toString());

    // Create directory if it doesn't exist
    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitized = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 200);

    cb(null, `${Date.now()}-${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    // Block dangerous file types
    const blocked = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.sh'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (blocked.includes(ext)) {
      return cb(new Error(`File type ${ext} not allowed for security`));
    }

    cb(null, true);
  }
});

// Rate limiting for chat messages (Claude API is expensive)
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute
  message: 'Too many messages. Please wait before sending more.',
  standardHeaders: true,
  legacyHeaders: false
});

// GET /chat - Main chat interface (auto-create or redirect to latest conversation)
router.get('/', requireAuth, (req, res) => {
  // Get user's latest conversation
  const latestConvo = db.prepare(`
    SELECT id FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(req.session.user.id);

  if (latestConvo) {
    // Redirect to latest conversation
    res.redirect(`/chat/${latestConvo.id}`);
  } else {
    // Create new conversation
    const result = db.prepare(`
      INSERT INTO conversations (user_id, title)
      VALUES (?, 'New Conversation')
    `).run(req.session.user.id);

    res.redirect(`/chat/${result.lastInsertRowid}`);
  }
});

// GET /chat/:id - Specific conversation view
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    // Get conversation
    const conversation = db.prepare(`
      SELECT * FROM conversations
      WHERE id = ? AND user_id = ?
    `).get(id, req.session.user.id);

    if (!conversation) {
      return res.status(404).render('layout', {
        title: 'Conversation Not Found',
        body: '<h1>Conversation Not Found</h1><p><a href="/chat">Start a new conversation</a></p>'
      });
    }

    // Get messages
    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(id);

    // Get user's conversations for sidebar
    const conversations = db.prepare(`
      SELECT id, title, updated_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(req.session.user.id);

    // Get jobs for this conversation
    const jobs = db.prepare(`
      SELECT DISTINCT cj.job_id
      FROM conversation_jobs cj
      WHERE cj.conversation_id = ?
    `).all(id);

    // Get provider configuration for model selector
    const overridesAllowed = isUserOverridesAllowed();
    const userConfig = overridesAllowed ? getUserModelConfig(req.session.user.id) : null;
    const defaultInfo = getInstanceDefaultInfo();

    res.render('chat', {
      title: conversation.title || 'Chat',
      conversation,
      messages,
      conversations,
      jobs,
      overridesAllowed,
      userConfig,
      defaultInfo
    });
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).render('layout', {
      title: 'Error',
      body: '<h1>Error Loading Conversation</h1><p><a href="/chat">Return to chat</a></p>'
    });
  }
});

// POST /chat - Create new conversation
router.post('/', requireAuth, (req, res) => {
  const result = db.prepare(`
    INSERT INTO conversations (user_id, title)
    VALUES (?, 'New Conversation')
  `).run(req.session.user.id);

  res.redirect(`/chat/${result.lastInsertRowid}`);
});

// POST /chat/:id/message - Send message to AI
router.post('/:id/message', requireAuth, chatRateLimit, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Verify conversation ownership
    const conversation = db.prepare(`
      SELECT * FROM conversations
      WHERE id = ? AND user_id = ?
    `).get(id, req.session.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update conversation timestamp
    db.prepare(`
      UPDATE conversations
      SET updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    // Send message to AI (will be saved in AIAgent)
    let responseText = '';

    await aiAgent.sendMessage(
      parseInt(id),
      message.trim(),
      (chunk) => {
        // Streaming chunks sent via SSE, not HTTP response
        responseText += chunk;
      },
      (fullResponse) => {
        // Message complete
        res.json({
          success: true,
          messageId: null, // Not needed for now
          response: fullResponse
        });
      }
    );
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /chat/:id/upload - Upload files to conversation
router.post('/:id/upload', requireAuth, upload.array('files', 10), (req, res) => {
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

    // Save attachment records
    const attachments = req.files.map(file => {
      const result = db.prepare(`
        INSERT INTO attachments (conversation_id, filename, original_name, file_path, mime_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        file.filename,
        file.originalname,
        file.path,
        file.mimetype,
        file.size
      );

      return {
        id: result.lastInsertRowid,
        filename: file.originalname,
        size: file.size
      };
    });

    res.json({
      success: true,
      files: attachments
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// GET /chat/:id/deck-readiness - Check if deck workflow has required files
router.get('/:id/deck-readiness', requireAuth, (req, res) => {
  const { id } = req.params;

  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(id, req.session.user.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const { csv, pptx } = getDeckAttachments(id);

  res.json({
    ready: Boolean(csv && pptx),
    csv: csv ? { id: csv.id, filename: csv.original_name } : null,
    pptx: pptx ? { id: pptx.id, filename: pptx.original_name } : null
  });
});

// POST /chat/:id/deck-plan - Build proposed deck DAG without execution
router.post('/:id/deck-plan', requireAuth, (req, res) => {
  const { id } = req.params;

  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(id, req.session.user.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const { csv, pptx } = getDeckAttachments(id);
  if (!csv || !pptx) {
    return res.status(400).json({
      error: 'Deck workflow requires one CSV and one PPTX attachment'
    });
  }

  const jobId = nextDeckJobId();
  const safeCsv = sanitizeForJobInputs(csv.original_name);
  const safePptx = sanitizeForJobInputs(pptx.original_name);
  const outputName = safePptx.replace(/\.pptx$/i, '') + '_updated.pptx';

  const tasks = [
    {
      taskName: 'build_deck',
      blockedBy: [],
      description: 'Generate updated deck from uploaded CSV and prior deck',
      commandPreview: `bash deck-gen/run_deck.sh --type sprint_review --csv jobs/${jobId}/inputs/${safeCsv} --template jobs/${jobId}/inputs/${safePptx} --deterministic --output jobs/${jobId}/output/${outputName}`
    },
    {
      taskName: 'validate_deck',
      blockedBy: ['build_deck'],
      description: 'Validate generated PPTX',
      commandPreview: `python3 deck-gen/scripts/validate_pptx.py jobs/${jobId}/output/${outputName}`
    }
  ];

  res.json({
    success: true,
    plan: {
      jobId,
      title: 'Sentry Deck Refresh',
      inputs: {
        csv: csv.original_name,
        pptx: pptx.original_name
      },
      tasks
    }
  });
});

// POST /chat/:id/deck-run - Create deck job + tasks and start worker execution
router.post('/:id/deck-run', requireAuth, async (req, res) => {
  const { id } = req.params;
  let { jobId } = req.body || {};

  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(id, req.session.user.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const { csv, pptx } = getDeckAttachments(id);
  if (!csv || !pptx) {
    return res.status(400).json({
      error: 'Deck workflow requires one CSV and one PPTX attachment'
    });
  }

  if (!jobId || !/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
    jobId = nextDeckJobId();
  }

  try {
    // Retry with a fresh ID if the plan ID was already used.
    let created = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        created = await aiAgent._createJob(parseInt(id, 10), {
          jobId,
          title: 'Sentry Deck Refresh'
        });
        break;
      } catch (err) {
        if (!String(err.message || '').includes('already exists')) {
          throw err;
        }
        jobId = nextDeckJobId();
      }
    }

    if (!created) {
      throw new Error('Failed to reserve a unique job ID');
    }

    const copiedInputs = created.copiedInputs || [];
    const copiedCsv = copiedInputs.find(isDeckCsv);
    const copiedPptx = copiedInputs.find(isDeckPptx);
    if (!copiedCsv || !copiedPptx) {
      throw new Error('Uploaded CSV/PPTX were not copied into job inputs');
    }

    const outputName = copiedPptx.replace(/\.pptx$/i, '') + '_updated.pptx';
    const buildCommand = `bash deck-gen/run_deck.sh --type sprint_review --csv jobs/${jobId}/inputs/${copiedCsv} --template jobs/${jobId}/inputs/${copiedPptx} --deterministic --output jobs/${jobId}/output/${outputName}`;
    const validateCommand = `python3 deck-gen/scripts/validate_pptx.py jobs/${jobId}/output/${outputName}`;

    const buildTask = await aiAgent._createTask({
      jobId,
      taskName: 'build_deck',
      description: 'Generate updated deck from uploaded CSV and prior deck',
      command: buildCommand,
      timeBudget: 20,
      blockedBy: []
    });

    const validateTask = await aiAgent._createTask({
      jobId,
      taskName: 'validate_deck',
      description: 'Validate generated PPTX',
      command: validateCommand,
      timeBudget: 10,
      blockedBy: ['build_deck']
    });

    workerManager.sendSSE(parseInt(id, 10), 'job_created', { jobId });

    res.json({
      success: true,
      jobId,
      tasks: [buildTask, validateTask]
    });
  } catch (error) {
    console.error('Error running deck workflow:', error);
    res.status(500).json({ error: error.message || 'Failed to run deck workflow' });
  }
});

// GET /chat/:id/stream - SSE endpoint for real-time updates
router.get('/:id/stream', requireAuth, (req, res) => {
  const { id } = req.params;

  // Verify conversation ownership
  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE id = ? AND user_id = ?
  `).get(id, req.session.user.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register client with WorkerManager
  workerManager.registerSSEClient(parseInt(id), res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: id })}\n\n`);

  // Heartbeat is handled by WorkerManager

  // Cleanup on disconnect happens in WorkerManager
});

// POST /chat/:id/model - Update conversation's model preference
router.post('/:id/model', requireAuth, (req, res) => {
  const { id } = req.params;
  const { modelRef } = req.body;

  try {
    if (!isUserOverridesAllowed()) {
      return res.status(403).json({ error: 'User model overrides not allowed' });
    }

    // Validate modelRef value
    if (modelRef !== null && modelRef !== 'user') {
      return res.status(400).json({ error: 'Invalid model_ref value' });
    }

    // Update conversation
    const result = db.prepare(`
      UPDATE conversations
      SET model_ref = ?
      WHERE id = ? AND user_id = ?
    `).run(modelRef, id, req.session.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation model:', error);
    res.status(500).json({ error: 'Failed to update model preference' });
  }
});

// DELETE /chat/:id - Delete conversation
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership and delete
    const result = db.prepare(`
      DELETE FROM conversations
      WHERE id = ? AND user_id = ?
    `).run(id, req.session.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

module.exports = router;
