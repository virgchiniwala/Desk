/**
 * Claude Code Provider
 * Invokes Claude CLI for code-aware conversations
 * Non-streaming, best-effort implementation
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const AIProvider = require('./base');

class ClaudeCodeProvider extends AIProvider {
  constructor(config) {
    super(config);

    this.cliPath = config.cliPath || 'claude';
    this.args = config.args || [];
  }

  async generate(messages, options = {}) {
    const {
      onChunk = null,
      maxTokens = 4096,
      temperature = 1.0
    } = options;

    // Claude Code CLI doesn't support streaming or tools
    // We'll send the conversation as a single prompt

    // Build prompt from messages
    const prompt = messages.map(msg => {
      if (msg.role === 'user') {
        return `Human: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    }).join('\n\n');

    try {
      // Invoke Claude CLI
      const result = await this._invokeCLI(prompt);

      // If streaming callback provided, send result as one chunk
      if (onChunk && result.content) {
        onChunk(result.content);
      }

      return {
        content: result.content,
        tool_calls: [],
        model: 'claude-code-cli',
        provider: 'claude-code'
      };
    } catch (error) {
      throw new Error(`Claude Code CLI error: ${error.message}`);
    }
  }

  async _invokeCLI(prompt) {
    return new Promise((resolve, reject) => {
      const args = [...this.args];

      // Spawn Claude CLI process
      const proc = spawn(this.cliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve({ content: stdout.trim() });
        }
      });

      // Send prompt to stdin
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  async healthcheck() {
    try {
      // Check if CLI exists and is executable
      const result = await this._invokeCLI('Hi');

      if (result.content) {
        return {
          healthy: true,
          message: 'Successfully connected to Claude Code CLI'
        };
      } else {
        return {
          healthy: false,
          message: 'Claude Code CLI returned empty response'
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Claude Code CLI error: ${error.message}`
      };
    }
  }

  capabilities() {
    return {
      streaming: false, // CLI doesn't support streaming
      tools: false,     // CLI doesn't support tool calling
      vision: false,
      maxTokens: 4096
    };
  }

  static getDisplayName() {
    return 'Claude Code (CLI)';
  }

  static getConfigFields() {
    return [
      {
        name: 'cliPath',
        label: 'CLI Path',
        type: 'text',
        required: true,
        defaultValue: 'claude',
        placeholder: '/usr/local/bin/claude',
        help: 'Path to claude CLI executable'
      },
      {
        name: 'args',
        label: 'Additional Arguments (Optional)',
        type: 'text',
        required: false,
        placeholder: '--model sonnet',
        help: 'Space-separated CLI arguments'
      }
    ];
  }
}

module.exports = ClaudeCodeProvider;
