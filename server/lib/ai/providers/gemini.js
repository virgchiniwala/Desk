/**
 * Google Gemini Provider
 * Uses official @google/genai SDK for Gemini models
 */

const { GoogleGenAI } = require('@google/genai');
const AIProvider = require('./base');

class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash-exp';

    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
    }

    // Initialize client with API key
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  async generate(messages, options = {}) {
    const {
      tools = [],
      onChunk = null,
      maxTokens = 8192,
      temperature = 1.0,
      system = null
    } = options;

    // Convert messages to Gemini format
    const geminiContents = this._convertMessages(messages, system);

    // Build request
    const request = {
      model: this.model,
      contents: geminiContents
    };

    // Add generation config if needed
    if (temperature !== 1.0 || maxTokens !== 8192) {
      request.generationConfig = {
        temperature,
        maxOutputTokens: maxTokens
      };
    }

    try {
      if (onChunk && tools.length === 0) {
        // Streaming mode
        const response = await this.client.models.generateContentStream(request);

        let fullText = '';
        for await (const chunk of response.stream) {
          if (chunk.text) {
            fullText += chunk.text;
            onChunk(chunk.text);
          }
        }

        return {
          content: fullText,
          tool_calls: [],
          model: this.model,
          provider: 'gemini'
        };
      } else {
        // Non-streaming mode
        const response = await this.client.models.generateContent(request);
        const content = response.text || '';

        // If streaming callback provided, send result as one chunk
        if (onChunk && content) {
          onChunk(content);
        }

        // TODO: Add function calling support when tools are provided
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
   * New SDK uses: { role: "user", parts: [{ text: "..." }] }
   */
  _convertMessages(messages, system) {
    const contents = [];

    // Add system message as first user message if present
    if (system) {
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${system}\n\n` }]
      });
    }

    // Convert messages
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];

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

      contents.push({ role, parts });
    }

    return contents;
  }

  async healthcheck() {
    try {
      // Simple test generation
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: 'Hi'
      });

      if (response.text) {
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
      vision: this.model.includes('vision') || this.model.includes('pro'),
      maxTokens: 32768 // Gemini 2.0 max tokens
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
        help: 'Get your API key from Google AI Studio (aistudio.google.com)'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: false,
        defaultValue: 'gemini-2.0-flash-exp',
        options: [
          { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
        ],
        help: 'Select Gemini model variant'
      }
    ];
  }
}

module.exports = GeminiProvider;
