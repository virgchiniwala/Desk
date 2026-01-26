/**
 * Base AIProvider interface
 * All providers must implement these methods
 */

class AIProvider {
  /**
   * @param {object} config - Provider configuration
   * @param {string} config.model - Model identifier
   * @param {string} config.apiKey - API key (if applicable)
   * @param {string} config.baseUrl - Base URL (if applicable)
   * @param {object} config.options - Provider-specific options
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Generate a response from the model
   * @param {Array} messages - Array of {role, content} messages
   * @param {object} options - Generation options
   * @param {Array} options.tools - Tool definitions (optional)
   * @param {Function} options.onChunk - Callback for streaming chunks
   * @param {number} options.maxTokens - Max tokens to generate
   * @param {number} options.temperature - Temperature (0-1)
   * @returns {Promise<object>} Response with content, tool_calls, etc.
   */
  async generate(messages, options = {}) {
    throw new Error('generate() must be implemented by provider');
  }

  /**
   * Check if provider is healthy and accessible
   * @returns {Promise<object>} {healthy: boolean, message: string}
   */
  async healthcheck() {
    throw new Error('healthcheck() must be implemented by provider');
  }

  /**
   * Get provider capabilities
   * @returns {object} Capabilities object
   */
  capabilities() {
    return {
      streaming: false,
      tools: false,
      vision: false,
      maxTokens: 4096
    };
  }

  /**
   * Get provider display name
   * @returns {string}
   */
  static getDisplayName() {
    throw new Error('getDisplayName() must be implemented by provider');
  }

  /**
   * Get required configuration fields for this provider
   * @returns {Array} Array of {name, label, type, required, placeholder}
   */
  static getConfigFields() {
    throw new Error('getConfigFields() must be implemented by provider');
  }
}

module.exports = AIProvider;
