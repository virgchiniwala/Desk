/**
 * Crypto utilities for encrypting/decrypting secrets
 * Uses AES-256-GCM with DESK_ENCRYPTION_KEY
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte key
 * @throws {Error} If key is missing or invalid
 */
function getEncryptionKey() {
  const keyHex = process.env.DESK_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('DESK_ENCRYPTION_KEY environment variable not set');
  }

  // Key should be 64 hex characters (32 bytes)
  if (keyHex.length !== 64) {
    throw new Error('DESK_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  try {
    return Buffer.from(keyHex, 'hex');
  } catch (error) {
    throw new Error('DESK_ENCRYPTION_KEY must be valid hex string');
  }
}

/**
 * Encrypt a secret string
 * @param {string} plaintext - Secret to encrypt
 * @returns {Buffer} Encrypted data (iv + authTag + ciphertext)
 * @throws {Error} If encryption fails
 */
function encryptSecret(plaintext) {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (16 bytes) + authTag (16 bytes) + ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a secret
 * @param {Buffer} encrypted - Encrypted data from encryptSecret()
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails or data is corrupted
 */
function decryptSecret(encrypted) {
  if (!Buffer.isBuffer(encrypted)) {
    throw new Error('Encrypted data must be a Buffer');
  }

  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short');
  }

  const key = getEncryptionKey();

  // Unpack: iv (16 bytes) + authTag (16 bytes) + ciphertext
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return plaintext.toString('utf8');
}

/**
 * Check if encryption is available
 * @returns {boolean} True if DESK_ENCRYPTION_KEY is set
 */
function isEncryptionAvailable() {
  try {
    getEncryptionKey();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a new random encryption key (for setup)
 * @returns {string} 64-character hex string (32 bytes)
 */
function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncryptionAvailable,
  generateEncryptionKey
};
