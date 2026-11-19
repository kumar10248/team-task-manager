const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

const INSECURE_DEFAULTS = [
  'your_jwt_secret_key',
  'your_jwt_secret_key_here',
  'secret',
  'jwt_secret',
  'changeme',
  '123456',
  'password',
];

// Ephemeral 256-bit secure secret generated once per process lifecycle if unconfigured in production
let fallbackSecret = null;

/**
 * Validates and retrieves the JWT_SECRET from environment.
 * If unset or matching known insecure default boilerplates, generates a cryptographically
 * secure random key so the server stays safe against forgery without crashing the deployment.
 */
function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();

  // If a valid, custom secret is provided and not an insecure default, use it
  if (secret && !INSECURE_DEFAULTS.includes(secret.toLowerCase())) {
    return secret;
  }

  // If unset or matching an insecure default, generate a secure 256-bit secret
  if (!fallbackSecret) {
    fallbackSecret = `taskforge_sec_${crypto.randomBytes(32).toString('hex')}`;
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  [SECURITY NOTICE] JWT_SECRET is unset or using a default key in production. An ephemeral 256-bit secret has been generated to protect against token forgery. To keep user sessions active across restarts, please set JWT_SECRET in your Render Dashboard Environment Variables.'
    );
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '⚠️  [SECURITY NOTICE] JWT_SECRET is unset or using a default key. Using a generated secure secret.'
    );
  }

  return fallbackSecret;
}

const JWT_SECRET = getJwtSecret();

module.exports = {
  JWT_SECRET,
  getJwtSecret,
};
