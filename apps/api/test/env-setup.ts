// Runs in every Jest worker before any module is imported
// eslint-disable-next-line @typescript-eslint/no-require-imports
const envUtils = require('./env-utils.js') as { applyTestEnv: () => void };

envUtils.applyTestEnv();
