const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const AIAgent = require('../lib/ai-agent');
const workerManager = require('../lib/worker-manager');
const db = require('../db/db');

const router = express.Router();
const aiAgent = new AIAgent();

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

    res.render('chat', {
      title: conversation.title || 'Chat',
      conversation,
      messages,
      conversations,
      jobs
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
