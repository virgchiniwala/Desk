const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { encryptSecret, isEncryptionAvailable } = require('../lib/crypto');
const {
  getAvailableProviders,
  getInstanceDefaultInfo,
  isUserOverridesAllowed,
  getUserModelConfig,
  instantiateProvider,
  PROVIDERS
} = require('../lib/ai/provider-manager');
const db = require('../db/db');

const router = express.Router();

// GET /settings/models - Model settings page
router.get('/models', requireAuth, (req, res) => {
  try {
    const defaultInfo = getInstanceDefaultInfo();
    const overridesAllowed = isUserOverridesAllowed();
    const encryptionAvailable = isEncryptionAvailable();

    // Get user's current config if any
    const userConfig = getUserModelConfig(req.session.user.id);

    // Get available providers
    const providers = getAvailableProviders();

    res.render('settings-models', {
      title: 'Model Settings',
      defaultProvider: defaultInfo.provider,
      defaultModel: defaultInfo.model,
      overridesAllowed,
      encryptionAvailable,
      userConfig,
      providers
    });
  } catch (error) {
    console.error('[Settings] Error loading model settings:', error);
    res.status(500).render('layout', {
      title: 'Error',
      body: '<h1>Error Loading Settings</h1><p><a href="/chat">Return to chat</a></p>'
    });
  }
});

// POST /settings/models/test - Test provider connection
router.post('/models/test', requireAuth, async (req, res) => {
  try {
    const { provider, model, config } = req.body;

    if (!provider || !model) {
      return res.status(400).json({ error: 'Provider and model are required' });
    }

    // Validate provider exists
    const ProviderClass = PROVIDERS[provider];
    if (!ProviderClass) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Build provider config
    const providerConfig = {
      model,
      ...config
    };

    // Instantiate provider
    const providerInstance = new ProviderClass(providerConfig);

    // Run healthcheck
    const result = await providerInstance.healthcheck();

    res.json(result);
  } catch (error) {
    console.error('[Settings] Test connection error:', error);
    res.status(500).json({
      healthy: false,
      message: `Error: ${error.message}`
    });
  }
});

// POST /settings/models - Save provider configuration
router.post('/models', requireAuth, async (req, res) => {
  try {
    // Check if user overrides are allowed
    if (!isUserOverridesAllowed()) {
      return res.status(403).json({ error: 'User model overrides not allowed on this instance' });
    }

    // Check if encryption is available
    if (!isEncryptionAvailable()) {
      return res.status(500).json({ error: 'Encryption not configured (DESK_ENCRYPTION_KEY missing)' });
    }

    const { provider, model, config } = req.body;

    if (!provider || !model) {
      return res.status(400).json({ error: 'Provider and model are required' });
    }

    // Validate provider exists
    const ProviderClass = PROVIDERS[provider];
    if (!ProviderClass) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Separate secrets from config
    const configFields = ProviderClass.getConfigFields();
    const secrets = {};
    const nonSecrets = {};

    for (const [key, value] of Object.entries(config)) {
      const field = configFields.find(f => f.name === key);
      if (field && field.type === 'password') {
        secrets[key] = value;
      } else {
        nonSecrets[key] = value;
      }
    }

    // Encrypt secrets
    const secretsJson = JSON.stringify(secrets);
    const secretEncrypted = encryptSecret(secretsJson);

    // Save or update user config
    const existing = db.prepare(`
      SELECT id FROM user_model_configs WHERE user_id = ?
    `).get(req.session.user.id);

    if (existing) {
      // Update existing config
      db.prepare(`
        UPDATE user_model_configs
        SET provider = ?, model = ?, config_json = ?, secret_encrypted = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        provider,
        model,
        JSON.stringify(nonSecrets),
        secretEncrypted,
        req.session.user.id
      );
    } else {
      // Insert new config
      db.prepare(`
        INSERT INTO user_model_configs (user_id, provider, model, config_json, secret_encrypted)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.session.user.id,
        provider,
        model,
        JSON.stringify(nonSecrets),
        secretEncrypted
      );
    }

    console.log(`[Settings] User ${req.session.user.username} configured ${provider}/${model}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[Settings] Save model config error:', error);
    res.status(500).json({ error: `Failed to save configuration: ${error.message}` });
  }
});

// DELETE /settings/models - Remove user's provider configuration
router.delete('/models', requireAuth, (req, res) => {
  try {
    db.prepare(`
      DELETE FROM user_model_configs WHERE user_id = ?
    `).run(req.session.user.id);

    console.log(`[Settings] User ${req.session.user.username} removed model config`);

    res.json({ success: true });
  } catch (error) {
    console.error('[Settings] Delete model config error:', error);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

module.exports = router;
