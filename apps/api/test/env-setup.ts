// Runs in every Jest worker before any module is imported
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyTestEnv } = require('./env-utils.js');

applyTestEnv();
