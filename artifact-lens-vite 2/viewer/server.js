const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { query } = require('./db');

const VIEWER_PORT = Number(process.env.VIEWER_PORT || 8181);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_secret_change_me';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

function viewerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'artifact-lens-viewer' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function toApiRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    timestamp: row.timestamp,
    cameraSource: row.camera_source,
    step1ObjectRead: row.step1_object_read,
    identification: row.identification,
    ageEstimate: row.age_estimate,
    ageConfidence: row.age_confidence,
    matchName: row.match_name,
    matchSourceUrl: row.match_source_url,
    eraCulture: row.era_culture,
    condition: row.condition,
    conditionRationale: row.condition_rationale,
    origin: row.origin,
    originConfidence: row.origin_confidence,
    summary: row.summary,
    confirmationStatus: row.confirmation_status,
    imageData: row.image_data || null,
    modelAvailable: !!row.model_path,
    fieldNotes: row.field_notes || null,
    accountEmail: row.account_email || undefined,
    accountDisplayName: row.account_display_name || undefined,
  };
}

app.get('/api/scans', viewerAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { account, status } = req.query;
    const params = [];
    const where = [];
    if (account) {
      params.push(account);
      where.push(`s.account_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`s.confirmation_status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `SELECT s.*, a.email AS account_email, a.display_name AS account_display_name
         FROM scans s LEFT JOIN accounts a ON a.id = s.account_id
         ${whereSql}
        ORDER BY s.timestamp DESC LIMIT 500`,
      params
    );
    return res.json(result.rows.map(toApiRow));
  } catch (err) {
    console.error('[viewer scans]', err.message);
    return res.status(500).json({ error: 'Could not load scans.' });
  }
});

app.get('/api/accounts', viewerAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const result = await query(
      `SELECT a.id, a.email, a.display_name, a.role, a.created_at,
              COUNT(s.id)::int AS "scanCount"
         FROM accounts a LEFT JOIN scans s ON s.account_id = a.id
        GROUP BY a.id ORDER BY a.created_at ASC`
    );
    return res.json(
      result.rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        role: r.role,
        createdAt: r.created_at,
        scanCount: r.scanCount,
      }))
    );
  } catch (err) {
    console.error('[viewer accounts]', err.message);
    return res.status(500).json({ error: 'Could not load accounts.' });
  }
});

if (require.main === module) {
  app.listen(VIEWER_PORT, () => {
    console.log(`[viewer] Archive Viewer listening on http://localhost:${VIEWER_PORT}`);
  });
}

module.exports = app;
