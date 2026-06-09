const { execSync } = require('child_process');
const path = require('path');
const { applyTestEnv } = require('./env-utils.js');

/** Applies pending migrations to the test database before the suite runs. */
module.exports = async () => {
  applyTestEnv();
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};
