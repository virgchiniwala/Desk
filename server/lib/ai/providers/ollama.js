/**
 * Ollama Provider
 * For local LLM inference via Ollama HTTP API
 */

const AIProvider = require('./base');

class OllamaProvider extends AIProvider {
  constructor(config) {
    super(config);

    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
  }

  async generate(messages, options = {}) {
    const {
      tools = [],
      onChunk = null,
      maxTokens = 4096,
      temperature = 1.0,
      system = null
    } = options;

    // Build Ollama request
    const requestBody = {
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: !!onChunk,
      options: {
        temperature,
        num_predict: maxTokens
      }
    };

    // Add system message if provided
    if (system) {
      requestBody.messages.unshift({
        role: 'system',
        content: system
      });
    }

    // Note: Ollama doesn't support tool calling yet, so we ignore tools parameter

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    if (onChunk) {
      // Streaming response (NDJSON)
      let fullContent = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);

            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              onChunk(parsed.message.content);
            }

            if (parsed.done) {
              break;
            }
          } catch (error) {
            console.error('[Ollama] Failed to parse chunk:', error);
          }
        }
      }

      return {
        content: fullContent,
        tool_calls: [],
        model: this.model,
        provider: 'ollama'
      };
    } else {
      // Non-streaming response
      const data = await response.json();

      return {
        content: data.message?.content || '',
        tool_calls: [],
        model: this.model,
        provider: 'ollama'
      };
    }
  }

  async healthcheck() {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        return {
          healthy: false,
          message: `Ollama API error: ${response.status}`
        };
      }

      const data = await response.json();
      const modelExists = data.models?.some(m => m.name === this.model);

      if (!modelExists) {
        return {
          healthy: false,
          message: `Model '${this.model}' not found. Available models: ${data.models?.map(m => m.name).join(', ') || 'none'}`
        };
      }

      return {
        healthy: true,
        message: `Successfully connected to Ollama (${this.model})`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Ollama error: ${error.message}. Is Ollama running?`
      };
    }
  }

  capabilities() {
    return {
      streaming: true,
      tools: false, // Ollama doesn't support tool calling yet
      vision: false,
      maxTokens: 4096
    };
  }

  static getDisplayName() {
    return 'Ollama (Local)';
  }

  static getConfigFields() {
    return [
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'text',
        required: true,
        defaultValue: 'http://localhost:11434',
        placeholder: 'http://localhost:11434',
        help: 'Ollama API endpoint (default: http://localhost:11434)'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        defaultValue: 'llama2',
        placeholder: 'llama2',
        help: 'Model name (e.g., llama2, mistral, codellama)'
      }
    ];
  }
}

module.exports = OllamaProvider;
