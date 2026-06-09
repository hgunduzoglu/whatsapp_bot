const fs = require('fs');
const path = require('path');

/** Minimal .env parser so tests do not need the dotenv package. */
function loadRootEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

/** Points the process at the TEST database/redis, never the dev ones. */
function applyTestEnv() {
  loadRootEnv();
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://app:app@localhost:5435/whatsapp_crm_test?schema=public';
  // Use a separate redis database index to keep dev queues untouched
  process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1';
  process.env.WHATSAPP_DRY_RUN = 'true';
  process.env.AUTHORIZED_WHATSAPP_PHONES = '905000000001';
  process.env.NODE_ENV = 'test';
}

module.exports = { loadRootEnv, applyTestEnv };
