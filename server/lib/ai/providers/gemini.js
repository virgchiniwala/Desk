/**
 * Google Gemini Provider
 * Uses Google Generative AI SDK for Gemini models
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIProvider = require('./base');

class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-pro';

    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
    }

    this.client = new GoogleGenerativeAI(this.apiKey);
  }

  async generate(messages, options = {}) {
    const {
      tools = [],
      onChunk = null,
      maxTokens = 4096,
      temperature = 1.0,
      system = null
    } = options;

    // Get generative model
    const model = this.client.getGenerativeModel({ model: this.model });

    // Convert messages to Gemini format
    const geminiMessages = this._convertMessages(messages, system);

    // Generate config
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens
    };

    try {
      if (onChunk && tools.length === 0) {
        // Streaming mode (tools not supported in streaming yet)
        const result = await model.generateContentStream(geminiMessages);

        let fullText = '';
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            onChunk(chunkText);
          }
        }

        return {
          content: fullText,
          tool_calls: [],
          model: this.model,
          provider: 'gemini'
        };
      } else {
        // Non-streaming mode (supports function calling)
        const result = await model.generateContent(geminiMessages);
        const response = result.response;

        const content = response.text();

        // If streaming callback provided, send result as one chunk
        if (onChunk && content) {
          onChunk(content);
        }

        // TODO: Add function calling support when tools are provided
        // Gemini uses a different function calling format

        return {
          content,
          tool_calls: [],
          model: this.model,
          provider: 'gemini'
        };
      }
    } catch (error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Convert messages to Gemini format
   */
  _convertMessages(messages, system) {
    const parts = [];

    // Add system message as first user message if present
    if (system) {
      parts.push({ text: `System: ${system}\n\n` });
    }

    // Convert messages
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Handle structured content (Anthropic format)
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          }
          // TODO: Handle other content types (images, tool_use, tool_result)
        }
      }
    }

    return parts;
  }

  async healthcheck() {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      // Simple test generation
      const result = await model.generateContent('Hi');
      const response = result.response;

      if (response.text()) {
        return {
          healthy: true,
          message: `Successfully connected to Gemini (${this.model})`
        };
      } else {
        return {
          healthy: false,
          message: 'Gemini API returned empty response'
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Gemini API error: ${error.message}`
      };
    }
  }

  capabilities() {
    return {
      streaming: true,
      tools: false, // TODO: Implement function calling
      vision: this.model.includes('vision'),
      maxTokens: 30720 // Gemini Pro max tokens
    };
  }

  static getDisplayName() {
    return 'Google Gemini';
  }

  static getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'AIza...',
        help: 'Get your API key from Google AI Studio'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: false,
        defaultValue: 'gemini-pro',
        options: [
          { value: 'gemini-pro', label: 'Gemini Pro' },
          { value: 'gemini-pro-vision', label: 'Gemini Pro Vision' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
        ],
        help: 'Select Gemini model variant'
      }
    ];
  }
}

module.exports = GeminiProvider;
