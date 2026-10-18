const express = require('express');
const { query } = require('../db');
const { authRequired, requireOwner } = require('../auth');

const router = express.Router();

router.use(authRequired);

const VALID_CONFIRM = new Set(['Unconfirmed', 'Confirmed correct', 'Marked wrong']);
const VALID_AGE_CONF = new Set(['High', 'Medium', 'Low', null, undefined, '']);
const VALID_CONDITION = new Set(['Pristine', 'Good', 'Worn', 'Damaged', 'Restored', 'Fragmentary', null, undefined, '']);
const VALID_ORIGIN_CONF = new Set(['High', 'Medium', 'Low', null, undefined, '']);

function norm(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v);
}

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
    modelPath: row.model_path || null,
    modelGeneratedAt: row.model_generated_at || null,
    angleCaptures: row.angle_captures || null,
    fieldNotes: row.field_notes || null,
    accountEmail: row.account_email || undefined,
    accountDisplayName: row.account_display_name || undefined,
  };
}

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const ageConfidence = norm(b.ageConfidence);
    const condition = norm(b.condition);
    const originConfidence = norm(b.originConfidence);
    if (!VALID_AGE_CONF.has(b.ageConfidence ?? null) && b.ageConfidence !== undefined) {
      if (ageConfidence && !['High', 'Medium', 'Low'].includes(ageConfidence)) {
        return res.status(400).json({ error: 'Invalid ageConfidence.' });
      }
    }
    if (condition && !['Pristine', 'Good', 'Worn', 'Damaged', 'Restored', 'Fragmentary'].includes(condition)) {
      return res.status(400).json({ error: 'Invalid condition.' });
    }
    if (originConfidence && !['High', 'Medium', 'Low'].includes(originConfidence)) {
      return res.status(400).json({ error: 'Invalid originConfidence.' });
    }
    let confirmationStatus = 'Unconfirmed';
    if (b.confirmationStatus && VALID_CONFIRM.has(b.confirmationStatus)) {
      confirmationStatus = b.confirmationStatus;
    }
    let imageData = null;
    if (b.imageData !== undefined && b.imageData !== null && b.imageData !== '') {
      imageData = String(b.imageData);
      if (imageData.length > 4000000) {
        return res.status(400).json({ error: 'Stored image is too large (max ~4MB).' });
      }
      if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageData) && !/^[A-Za-z0-9+/=\s]+$/.test(imageData)) {
        return res.status(400).json({ error: 'Invalid image data.' });
      }
      if (!imageData.startsWith('data:')) {
        imageData = `data:image/jpeg;base64,${imageData.replace(/\s/g, '')}`;
      }
    }
    const result = await query(
      `INSERT INTO scans
        (account_id, camera_source, step1_object_read, identification, age_estimate, age_confidence,
         match_name, match_source_url, era_culture, condition, condition_rationale,
         origin, origin_confidence, summary, confirmation_status, image_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.userId,
        norm(b.cameraSource),
        norm(b.step1ObjectRead),
        norm(b.identification),
        norm(b.ageEstimate),
        ageConfidence,
        norm(b.matchName),
        norm(b.matchSourceUrl),
        norm(b.eraCulture),
        condition,
        norm(b.conditionRationale),
        norm(b.origin),
        originConfidence,
        norm(b.summary),
        confirmationStatus,
        imageData,
      ]
    );
    return res.status(201).json(toApiRow(result.rows[0]));
  } catch (err) {
    console.error('[scans POST]', err.message);
    return res.status(500).json({ error: 'Could not save the scan.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { account, status, limit, offset } = req.query;
    const params = [];
    const where = [];
    if (req.user.role === 'owner') {
      if (account) {
        params.push(account);
        where.push(`s.account_id = $${params.length}`);
      }
    } else {
      params.push(req.user.userId);
      where.push(`s.account_id = $${params.length}`);
    }
    if (status) {
      if (!VALID_CONFIRM.has(status)) {
        return res.status(400).json({ error: 'Invalid status filter.' });
      }
      params.push(status);
      where.push(`s.confirmation_status = $${params.length}`);
    }
    const lim = Math.min(Math.max(parseInt(limit || '50', 10) || 50, 1), 200);
    const off = Math.max(parseInt(offset || '0', 10) || 0, 0);
    params.push(lim);
    const limIdx = params.length;
    params.push(off);
    const offIdx = params.length;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `SELECT s.*,
              a.email AS account_email,
              a.display_name AS account_display_name
         FROM scans s
         LEFT JOIN accounts a ON a.id = s.account_id
         ${whereSql}
         ORDER BY s.timestamp DESC
         LIMIT $${limIdx} OFFSET $${offIdx}`,
      params
    );
    return res.json(result.rows.map(toApiRow));
  } catch (err) {
    console.error('[scans GET]', err.message);
    return res.status(500).json({ error: 'Could not load scans.' });
  }
});

// Bulk delete (owner only). Must be registered before '/:id' routes for clarity.
router.delete('/', requireOwner, async (req, res) => {
  try {
    const { ids, all } = req.body || {};
    if (all === true) {
      const result = await query('DELETE FROM scans');
      return res.json({ deleted: result.rowCount });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Provide ids: [...] or { all: true }.' });
    }
    const result = await query('DELETE FROM scans WHERE id = ANY($1::uuid[])', [ids]);
    return res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[scans bulk DELETE]', err.message);
    return res.status(500).json({ error: 'Bulk delete failed.' });
  }
});

// Total scan counter for the instrument frame. Scoped like the list.
router.get('/count', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'owner') {
      result = await query('SELECT COUNT(*)::int AS count FROM scans');
    } else {
      result = await query('SELECT COUNT(*)::int AS count FROM scans WHERE account_id = $1', [req.user.userId]);
    }
    return res.json({ count: result.rows[0].count });
  } catch (err) {
    console.error('[scans count]', err.message);
    return res.status(500).json({ error: 'Could not count scans.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, a.email AS account_email, a.display_name AS account_display_name
         FROM scans s LEFT JOIN accounts a ON a.id = s.account_id
        WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found — it may have already been deleted.' });
    }
    const row = result.rows[0];
    if (req.user.role !== 'owner' && row.account_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    return res.json(toApiRow(row));
  } catch (err) {
    console.error('[scans GET :id]', err.message);
    return res.status(500).json({ error: 'Could not load the scan.' });
  }
});

router.patch('/:id/confirm', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (status !== 'Confirmed correct' && status !== 'Marked wrong') {
      return res.status(400).json({ error: "status must be 'Confirmed correct' or 'Marked wrong'." });
    }
    const found = await query('SELECT account_id FROM scans WHERE id = $1', [req.params.id]);
    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found — it may have already been deleted.' });
    }
    if (req.user.role !== 'owner' && found.rows[0].account_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const result = await query(
      'UPDATE scans SET confirmation_status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    return res.json(toApiRow(result.rows[0]));
  } catch (err) {
    console.error('[scans PATCH confirm]', err.message);
    return res.status(500).json({ error: 'Could not update confirmation.' });
  }
});

router.patch('/:id/notes', async (req, res) => {
  try {
    const { fieldNotes } = req.body || {};
    const found = await query('SELECT account_id FROM scans WHERE id = $1', [req.params.id]);
    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found — it may have already been deleted.' });
    }
    if (req.user.role !== 'owner' && found.rows[0].account_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const result = await query(
      'UPDATE scans SET field_notes = $1 WHERE id = $2 RETURNING *',
      [fieldNotes ? String(fieldNotes).slice(0, 10000) : null, req.params.id]
    );
    return res.json(toApiRow(result.rows[0]));
  } catch (err) {
    console.error('[scans PATCH notes]', err.message);
    return res.status(500).json({ error: 'Could not save field notes.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const found = await query('SELECT account_id FROM scans WHERE id = $1', [req.params.id]);
    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found — it may have already been deleted.' });
    }
    if (req.user.role !== 'owner' && found.rows[0].account_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    await query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    return res.json({ deleted: 1 });
  } catch (err) {
    console.error('[scans DELETE :id]', err.message);
    return res.status(500).json({ error: 'Delete failed.' });
  }
});

module.exports = router;
