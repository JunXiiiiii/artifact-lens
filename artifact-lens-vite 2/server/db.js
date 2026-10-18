const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[db] DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'consumer',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  camera_source TEXT,
  step1_object_read TEXT,
  identification TEXT,
  age_estimate TEXT,
  age_confidence TEXT CHECK (age_confidence IN ('High','Medium','Low')),
  match_name TEXT,
  match_source_url TEXT,
  era_culture TEXT,
  condition TEXT CHECK (condition IN ('Pristine','Good','Worn','Damaged','Restored','Fragmentary')),
  condition_rationale TEXT,
  origin TEXT,
  origin_confidence TEXT CHECK (origin_confidence IN ('High','Medium','Low')),
  summary TEXT,
  confirmation_status TEXT NOT NULL DEFAULT 'Unconfirmed'
    CHECK (confirmation_status IN ('Unconfirmed','Confirmed correct','Marked wrong')),
  image_data TEXT,
  model_path TEXT,
  model_generated_at TIMESTAMPTZ,
  angle_captures JSONB,
  field_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_account_id ON scans(account_id);
CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp DESC);

-- Thumbnails for scans created before image storage existed.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS image_data TEXT;
-- 3D model generation + field notes.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS model_path TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS model_generated_at TIMESTAMPTZ;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS angle_captures JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS field_notes TEXT;
`;

async function initDb() {
  await pool.query(SCHEMA_SQL);
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, initDb, SCHEMA_SQL };
