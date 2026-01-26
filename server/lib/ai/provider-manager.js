/**
 * Provider Manager
 * Handles provider instantiation and selection logic
 */

const db = require('../../db/db');
const { decryptSecret, isEncryptionAvailable } = require('../crypto');
const AnthropicProvider = require('./providers/anthropic');
const OpenAIProvider = require('./providers/openai');
const OllamaProvider = require('./providers/ollama');
const ClaudeCodeProvider = require('./providers/claude-code');
const GeminiProvider = require('./providers/gemini');

// Provider registry
const PROVIDERS = {
  'anthropic': AnthropicProvider,
  'openai': OpenAIProvider,
  'ollama': OllamaProvider,
  'claude-code': ClaudeCodeProvider,
  'gemini': GeminiProvider
};

/**
 * Get provider for a conversation
 * @param {number} conversationId - Conversation ID
 * @param {number} userId - User ID
 * @returns {AIProvider} Provider instance
 */
function getProviderForConversation(conversationId, userId) {
  // Get conversation model preference
  const conversation = db.prepare(`
    SELECT model_ref FROM conversations WHERE id = ?
  `).get(conversationId);

  const modelRef = conversation?.model_ref;

  // Determine which config to use
  if (modelRef === 'user' || (modelRef === null && isUserOverridesAllowed())) {
    // Try to use user's configured provider
    const userConfig = getUserModelConfig(userId);
    if (userConfig) {
      return instantiateProvider(userConfig);
    }
  }

  // Fall back to instance default
  return getInstanceDefaultProvider();
}

/**
 * Get instance default provider from environment
 * @returns {AIProvider} Provider instance
 */
function getInstanceDefaultProvider() {
  const provider = process.env.DESK_AI_PROVIDER || 'anthropic';
  const model = process.env.DESK_AI_MODEL || 'claude-sonnet-4-5-20250929';

  const config = {
    provider,
    model,
    config_json: {}
  };

  // Get API key from environment
  if (provider === 'anthropic') {
    config.secret = { apiKey: process.env.ANTHROPIC_API_KEY };
  } else if (provider === 'openai') {
    config.secret = {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL
    };
    config.config_json.baseUrl = process.env.OPENAI_BASE_URL;
  } else if (provider === 'ollama') {
    config.config_json.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  } else if (provider === 'claude-code') {
    config.config_json.cliPath = process.env.CLAUDE_CODE_PATH || 'claude';
    if (process.env.CLAUDE_CODE_ARGS) {
      config.config_json.args = process.env.CLAUDE_CODE_ARGS.split(' ');
    }
  } else if (provider === 'gemini') {
    // Support both GEMINI_API_KEY (official docs) and GOOGLE_API_KEY (legacy)
    config.secret = { apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY };
  }

  return instantiateProvider(config);
}

/**
 * Get user's configured provider
 * @param {number} userId - User ID
 * @returns {object|null} User config or null
 */
function getUserModelConfig(userId) {
  const row = db.prepare(`
    SELECT provider, model, config_json, secret_encrypted
    FROM user_model_configs
    WHERE user_id = ?
  `).get(userId);

  if (!row) {
    return null;
  }

  // Decrypt secret if present
  let secret = null;
  if (row.secret_encrypted) {
    try {
      const decrypted = decryptSecret(row.secret_encrypted);
      secret = JSON.parse(decrypted);
    } catch (error) {
      console.error('[ProviderManager] Failed to decrypt user secret:', error);
      return null;
    }
  }

  return {
    provider: row.provider,
    model: row.model,
    config_json: row.config_json ? JSON.parse(row.config_json) : {},
    secret
  };
}

/**
 * Instantiate a provider from config
 * @param {object} config - Provider configuration
 * @returns {AIProvider} Provider instance
 */
function instantiateProvider(config) {
  const ProviderClass = PROVIDERS[config.provider];

  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  // Build provider config
  const providerConfig = {
    model: config.model,
    ...config.config_json
  };

  // Add secrets
  if (config.secret) {
    Object.assign(providerConfig, config.secret);
  }

  return new ProviderClass(providerConfig);
}

/**
 * Check if user overrides are allowed
 * @returns {boolean}
 */
function isUserOverridesAllowed() {
  return process.env.DESK_ALLOW_USER_MODEL_OVERRIDES === 'true';
}

/**
 * Get all available providers
 * @returns {Array} Array of {id, name, fields}
 */
function getAvailableProviders() {
  return Object.keys(PROVIDERS).map(id => ({
    id,
    name: PROVIDERS[id].getDisplayName(),
    fields: PROVIDERS[id].getConfigFields()
  }));
}

/**
 * Get instance default provider info
 * @returns {object} {provider, model}
 */
function getInstanceDefaultInfo() {
  return {
    provider: process.env.DESK_AI_PROVIDER || 'anthropic',
    model: process.env.DESK_AI_MODEL || 'claude-sonnet-4-5-20250929'
  };
}

module.exports = {
  getProviderForConversation,
  getInstanceDefaultProvider,
  getUserModelConfig,
  instantiateProvider,
  isUserOverridesAllowed,
  getAvailableProviders,
  getInstanceDefaultInfo,
  PROVIDERS
};
