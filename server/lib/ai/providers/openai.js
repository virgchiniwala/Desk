/**
 * OpenAI Provider
 * Compatible with OpenAI Chat Completions API and compatible endpoints
 */

const AIProvider = require('./base');

class OpenAIProvider extends AIProvider {
  constructor(config) {
    super(config);

    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4-turbo-preview';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async generate(messages, options = {}) {
    const {
      tools = [],
      onChunk = null,
      maxTokens = 4096,
      temperature = 1.0,
      system = null
    } = options;

    // Build messages (OpenAI includes system as first message)
    const apiMessages = [];
    if (system) {
      apiMessages.push({
        role: 'system',
        content: system
      });
    }

    apiMessages.push(...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    // Build request body
    const requestBody = {
      model: this.model,
      messages: apiMessages,
      max_tokens: maxTokens,
      temperature,
      stream: !!onChunk
    };

    if (tools.length > 0) {
      // Convert Anthropic tool format to OpenAI function format
      requestBody.tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }
      }));
    }

    // Make API request
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    if (onChunk) {
      // Streaming response
      let fullContent = '';
      let toolCalls = [];

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                onChunk(delta.content);
              }

              if (delta?.tool_calls) {
                // Accumulate tool calls
                for (const toolCall of delta.tool_calls) {
                  if (!toolCalls[toolCall.index]) {
                    toolCalls[toolCall.index] = {
                      id: toolCall.id,
                      name: toolCall.function?.name || '',
                      input: ''
                    };
                  }

                  if (toolCall.function?.arguments) {
                    toolCalls[toolCall.index].input += toolCall.function.arguments;
                  }
                }
              }
            } catch (error) {
              console.error('[OpenAI] Failed to parse chunk:', error);
            }
          }
        }
      }

      // Parse accumulated tool call inputs
      toolCalls = toolCalls.filter(tc => tc).map(tc => ({
        ...tc,
        input: tc.input ? JSON.parse(tc.input) : {}
      }));

      return {
        content: fullContent,
        tool_calls: toolCalls,
        model: this.model,
        provider: 'openai'
      };
    } else {
      // Non-streaming response
      const data = await response.json();
      const choice = data.choices[0];

      const content = choice.message.content || '';
      const toolCalls = (choice.message.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments)
      }));

      return {
        content,
        tool_calls: toolCalls,
        model: this.model,
        provider: 'openai'
      };
    }
  }

  async healthcheck() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          healthy: false,
          message: `OpenAI API error: ${response.status} ${error}`
        };
      }

      return {
        healthy: true,
        message: `Successfully connected to OpenAI (${this.model})`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `OpenAI error: ${error.message}`
      };
    }
  }

  capabilities() {
    return {
      streaming: true,
      tools: true,
      vision: this.model.includes('gpt-4') && this.model.includes('vision'),
      maxTokens: 4096
    };
  }

  static getDisplayName() {
    return 'OpenAI';
  }

  static getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-...',
        help: 'Get your API key from https://platform.openai.com/api-keys'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        defaultValue: 'gpt-4-turbo-preview',
        options: [
          { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
          { value: 'gpt-4', label: 'GPT-4' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
        ]
      },
      {
        name: 'baseUrl',
        label: 'Base URL (Optional)',
        type: 'text',
        required: false,
        placeholder: 'https://api.openai.com/v1',
        help: 'For OpenAI-compatible endpoints (leave blank for default)'
      }
    ];
  }
}

module.exports = OpenAIProvider;
