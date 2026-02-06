const db = require('../db/db');
const fs = require('fs');
const path = require('path');
const TaskGraph = require('./task-graph');
const { runRalphScript } = require('./shell-runner');
const { listJobOutputFiles } = require('./job-reader');
const SYSTEM_PROMPT = require('./ai-agent-prompt');
const { getProviderForConversation } = require('./ai/provider-manager');

/**
 * AI Agent for conversational task execution
 *
 * Integrates with AI providers to:
 * - Interview users about their goals
 * - Generate task plans with dependencies
 * - Create and monitor Ralph jobs
 * - Deliver artifacts
 */
class AIAgent {
  constructor() {
    // Provider selection happens per-conversation in sendMessage()
  }

  _sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  }

  _encodeArtifactPath(relativePath) {
    return relativePath.split('/').map(part => encodeURIComponent(part)).join('/');
  }

  /**
   * Send message to AI and get streaming response
   * @param {number} conversationId - Conversation ID
   * @param {string} userMessage - User's message
   * @param {function} onStream - Callback for streaming chunks
   * @param {function} onComplete - Callback when done
   */
  async sendMessage(conversationId, userMessage, onStream, onComplete) {
    try {
      // Save user message
      db.prepare(`
        INSERT INTO messages (conversation_id, role, content)
        VALUES (?, 'user', ?)
      `).run(conversationId, userMessage);

      // Get conversation's user_id for provider selection
      const conversation = db.prepare(`
        SELECT user_id FROM conversations WHERE id = ?
      `).get(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get provider for this conversation
      const provider = getProviderForConversation(conversationId, conversation.user_id);

      // Get conversation history
      const history = this._getConversationHistory(conversationId);

      // Build messages array
      const messages = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      // Stream response from provider
      const response = await provider.generate(messages, {
        system: SYSTEM_PROMPT,
        tools: this._getTools(),
        onChunk: onStream,
        maxTokens: 4096
      });

      let fullResponse = response.content || '';
      const toolCalls = response.tool_calls || [];

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        const toolResults = await this._executeTools(conversationId, toolCalls);

        // Save assistant message with tool calls
        db.prepare(`
          INSERT INTO messages (conversation_id, role, content, tool_calls, tool_results)
          VALUES (?, 'assistant', ?, ?, ?)
        `).run(
          conversationId,
          fullResponse,
          JSON.stringify(toolCalls),
          JSON.stringify(toolResults)
        );

        // Continue conversation with tool results
        messages.push({
          role: 'assistant',
          content: [
            { type: 'text', text: fullResponse },
            ...toolCalls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input
            }))
          ]
        });

        messages.push({
          role: 'user',
          content: toolResults.map(tr => ({
            type: 'tool_result',
            tool_use_id: tr.tool_use_id,
            content: JSON.stringify(tr.result)
          }))
        });

        // Get follow-up response from provider
        const followUpResponse = await provider.generate(messages, {
          system: SYSTEM_PROMPT,
          tools: this._getTools(),
          maxTokens: 4096,
          onChunk: (chunk) => onStream('\n\n' + chunk)
        });

        const followUpText = followUpResponse.content || '';
        fullResponse += '\n\n' + followUpText;

        // Save follow-up message
        db.prepare(`
          INSERT INTO messages (conversation_id, role, content)
          VALUES (?, 'assistant', ?)
        `).run(conversationId, followUpText);
      } else {
        // Save assistant message (no tools)
        db.prepare(`
          INSERT INTO messages (conversation_id, role, content)
          VALUES (?, 'assistant', ?)
        `).run(conversationId, fullResponse);
      }

      onComplete(fullResponse);
    } catch (error) {
      console.error('AI Agent error:', error);
      const errorMsg = 'I encountered an error. Please try again.';
      onStream(errorMsg);
      onComplete(errorMsg);
    }
  }

  /**
   * Define tools available to the AI
   */
  _getTools() {
    return [
      {
        name: 'create_job',
        description: 'Create a new Ralph job directory. Only call after user approves your plan.',
        input_schema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Job ID in format PROJECT-NNN (e.g., PROJECT-001)'
            },
            title: {
              type: 'string',
              description: 'Descriptive title for the job'
            }
          },
          required: ['jobId', 'title']
        }
      },
      {
        name: 'create_task',
        description: 'Create a task with explicit dependencies. Use this instead of enqueue_phase.',
        input_schema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Job ID'
            },
            taskName: {
              type: 'string',
              description: 'Unique task identifier (e.g., "fetch_data", "analyze_results")'
            },
            description: {
              type: 'string',
              description: 'What this task does'
            },
            command: {
              type: 'string',
              description: 'Bash command to execute'
            },
            timeBudget: {
              type: 'number',
              description: 'Time budget in minutes (default 30)'
            },
            blockedBy: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of task names that must complete first (empty array for no dependencies)'
            }
          },
          required: ['jobId', 'taskName', 'command']
        }
      },
      {
        name: 'check_job_status',
        description: 'Check status of a job and its tasks',
        input_schema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Job ID to check'
            }
          },
          required: ['jobId']
        }
      },
      {
        name: 'list_artifacts',
        description: 'List output files produced by a job',
        input_schema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Job ID'
            }
          },
          required: ['jobId']
        }
      }
    ];
  }

  /**
   * Execute tool calls
   */
  async _executeTools(conversationId, toolCalls) {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        let result;

        switch (toolCall.name) {
          case 'create_job':
            result = await this._createJob(conversationId, toolCall.input);
            break;

          case 'create_task':
            result = await this._createTask(toolCall.input);
            break;

          case 'check_job_status':
            result = await this._checkJobStatus(toolCall.input);
            break;

          case 'list_artifacts':
            result = await this._listArtifacts(toolCall.input);
            break;

          default:
            result = { error: `Unknown tool: ${toolCall.name}` };
        }

        results.push({
          tool_use_id: toolCall.id,
          result: result
        });
      } catch (error) {
        results.push({
          tool_use_id: toolCall.id,
          result: { error: error.message }
        });
      }
    }

    return results;
  }

  /**
   * Create job tool implementation
   */
  async _createJob(conversationId, input) {
    const { jobId, title } = input;

    // Validate job ID format
    if (!/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
      throw new Error('Invalid job ID format. Must be PROJECT-NNN (uppercase, 3 digits)');
    }

    // Run new-job.sh script
    const result = await runRalphScript('new-job.sh', [jobId, title]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to create job');
    }

    // Link job to conversation
    db.prepare(`
      INSERT INTO conversation_jobs (conversation_id, job_id)
      VALUES (?, ?)
    `).run(conversationId, jobId);

    // Copy any uploaded attachments into job inputs for task commands.
    const attachments = db.prepare(`
      SELECT original_name, file_path
      FROM attachments
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    const copiedInputs = [];
    const inputsDir = path.join(__dirname, '../../jobs', jobId, 'inputs');

    for (const attachment of attachments) {
      if (!attachment.file_path || !fs.existsSync(attachment.file_path)) {
        continue;
      }

      const baseName = this._sanitizeFilename(attachment.original_name || path.basename(attachment.file_path));
      const ext = path.extname(baseName);
      const stem = ext ? baseName.slice(0, -ext.length) : baseName;
      let candidate = baseName;
      let idx = 1;
      while (fs.existsSync(path.join(inputsDir, candidate))) {
        candidate = `${stem}_${idx}${ext}`;
        idx += 1;
      }

      fs.copyFileSync(attachment.file_path, path.join(inputsDir, candidate));
      copiedInputs.push(candidate);
    }

    return {
      success: true,
      jobId,
      copiedInputs,
      message: `Job ${jobId} created successfully`
    };
  }

  /**
   * Create task tool implementation
   */
  async _createTask(input) {
    const { jobId, taskName, description, command, timeBudget, blockedBy } = input;

    // Validate command for security
    this._validateCommand(command);

    // Create task with dependencies
    const taskId = TaskGraph.createTask(jobId, taskName, command, {
      description,
      timeBudget: timeBudget || 30,
      blockedBy: blockedBy || []
    });

    return {
      success: true,
      taskId,
      taskName,
      message: `Task "${taskName}" created with ${blockedBy?.length || 0} dependencies`
    };
  }

  /**
   * Check job status tool implementation
   */
  async _checkJobStatus(input) {
    const { jobId } = input;

    // Get task dependency graph
    const graph = TaskGraph.getDependencyGraph(jobId);

    return {
      jobId,
      tasks: graph.tasks.map(task => ({
        taskName: task.task_name,
        status: task.status,
        description: task.description,
        attemptCount: task.attempt_count,
        startedAt: task.started_at,
        completedAt: task.completed_at,
        blockedBy: graph.dependencies
          .filter(d => d.task_id === task.id)
          .map(d => d.blocked_by_name)
      }))
    };
  }

  /**
   * List artifacts tool implementation
   */
  async _listArtifacts(input) {
    const { jobId } = input;

    try {
      const files = listJobOutputFiles(jobId);

      return {
        jobId,
        artifacts: files.map(file => ({
          filename: file.relativePath,
          path: `/artifacts/${jobId}/output/${this._encodeArtifactPath(file.relativePath)}`,
          size: file.size
        }))
      };
    } catch (error) {
      return {
        jobId,
        artifacts: [],
        message: 'No artifacts yet'
      };
    }
  }

  /**
   * Validate command for security
   */
  _validateCommand(command) {
    // Allowlisted entrypoints only.
    const allowedPrefixes = [
      'python ',
      'python3 ',
      'bash ',
      'node ',
      './deck-gen/run_deck.sh ',
      'deck-gen/run_deck.sh '
    ];
    if (!allowedPrefixes.some(prefix => command.startsWith(prefix))) {
      throw new Error('Command must start with an allowlisted executable');
    }

    const blockedPatterns = [
      /rm\s+-rf\s+\//,           // rm -rf /
      />\s*\/dev\/sd[a-z]/,      // write to disk devices
      /curl.*\|\s*bash/,         // pipe to bash
      /wget.*\|\s*sh/,           // pipe to shell
      /\$\(.*\)/,                // command substitution
      /`.*`/,                    // backticks
      /\|/,                      // pipe operators
      /\s;\s*/,                  // command separator
      /\s&&\s/,                  // chained commands
      /\s\|\|\s/,                // OR-chained commands
      /&&.*rm/,                  // chained destructive
      /;\s*rm/,                  // semicolon destructive
      /\/etc\//,                 // access /etc
      /\/var\//,                 // access /var
      /~\/\.ssh/,                // access SSH keys
      /~\/\.aws/,                // access AWS credentials
      /\.env/                    // access .env files
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(command)) {
        throw new Error('Command contains blocked pattern for security');
      }
    }

    // Enforce job-scoped paths if any jobs path appears in command.
    const jobRefs = [...command.matchAll(/jobs\/([A-Z]+-[0-9]{3})\//g)].map(m => m[1]);
    if (jobRefs.length > 0 && new Set(jobRefs).size > 1) {
      throw new Error('Command cannot reference multiple jobs');
    }
  }

  /**
   * Get conversation history
   */
  _getConversationHistory(conversationId, limit = 50) {
    return db.prepare(`
      SELECT role, content, tool_calls, tool_results, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, limit).reverse();
  }
}

module.exports = AIAgent;
