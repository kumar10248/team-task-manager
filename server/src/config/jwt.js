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

/**
 * Validates and retrieves the JWT_SECRET from environment.
 * Enforces high entropy in production and throws fatal startup error if insecure default is found.
 */
function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();

  if (!secret || INSECURE_DEFAULTS.includes(secret.toLowerCase())) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET must be configured with a high-entropy secret (at least 32 characters) in production. Refusing to start.'
      );
    }

    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  [SECURITY WARNING] JWT_SECRET is unset or using a known insecure default. Set a strong secret in production.'
      );
    }
    return secret || 'taskforge_dev_jwt_secret_do_not_use_in_prod';
  }

  if (secret.length < 16 && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL SECURITY ERROR: JWT_SECRET is too short (minimum 16 characters required). Refusing to start.'
    );
  }

  return secret;
}

const JWT_SECRET = getJwtSecret();

module.exports = {
  JWT_SECRET,
  getJwtSecret,
};
