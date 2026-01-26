/**
 * Anthropic AI Provider
 * Uses Claude API via @anthropic-ai/sdk
 */

const Anthropic = require('@anthropic-ai/sdk');
const AIProvider = require('./base');

class AnthropicProvider extends AIProvider {
  constructor(config) {
    super(config);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey
    });

    this.model = config.model || 'claude-sonnet-4-5-20250929';
  }

  async generate(messages, options = {}) {
    const {
      tools = [],
      onChunk = null,
      maxTokens = 4096,
      temperature = 1.0,
      system = null
    } = options;

    // Build request
    const request = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    if (system) {
      request.system = system;
    }

    if (tools.length > 0) {
      request.tools = tools;
    }

    // Streaming or non-streaming
    if (onChunk) {
      request.stream = true;

      const stream = await this.client.messages.create(request);

      let fullResponse = '';
      let toolCalls = [];
      let currentToolUse = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            fullResponse += event.delta.text;
            onChunk(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            if (currentToolUse) {
              currentToolUse.input += event.delta.partial_json;
            }
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              currentToolUse.input = JSON.parse(currentToolUse.input);
              toolCalls.push(currentToolUse);
            } catch (error) {
              console.error('[Anthropic] Failed to parse tool input:', error);
            }
            currentToolUse = null;
          }
        }
      }

      return {
        content: fullResponse,
        tool_calls: toolCalls,
        model: this.model,
        provider: 'anthropic'
      };
    } else {
      // Non-streaming
      const response = await this.client.messages.create(request);

      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      const toolCalls = response.content
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: block.id,
          name: block.name,
          input: block.input
        }));

      return {
        content: textContent,
        tool_calls: toolCalls,
        model: this.model,
        provider: 'anthropic'
      };
    }
  }

  async healthcheck() {
    try {
      // Test with a minimal request
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });

      return {
        healthy: true,
        message: `Successfully connected to Anthropic (${this.model})`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Anthropic error: ${error.message}`
      };
    }
  }

  capabilities() {
    return {
      streaming: true,
      tools: true,
      vision: true,
      maxTokens: 8192
    };
  }

  static getDisplayName() {
    return 'Anthropic Claude';
  }

  static getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-ant-...',
        help: 'Get your API key from https://console.anthropic.com/settings/keys'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        defaultValue: 'claude-sonnet-4-5-20250929',
        options: [
          { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
          { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
          { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
        ]
      }
    ];
  }
}

module.exports = AnthropicProvider;
