const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();
const { initDb } = require('../db');

async function main() {
  const { pool } = require('../db');
  try {
    await initDb();
    console.log('[db:init] Schema is up to date.');
  } catch (err) {
    console.error('[db:init] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
