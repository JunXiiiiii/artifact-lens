const express = require('express');
const { query } = require('../db');
const { authRequired, requireOwner } = require('../auth');

const router = express.Router();

router.use(authRequired);
router.use(requireOwner);

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.id, a.email, a.display_name, a.role, a.created_at,
              COUNT(s.id)::int AS "scanCount"
         FROM accounts a
         LEFT JOIN scans s ON s.account_id = a.id
        GROUP BY a.id, a.email, a.display_name, a.role, a.created_at
        ORDER BY a.created_at ASC`
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
    console.error('[accounts GET]', err.message);
    return res.status(500).json({ error: 'Could not load accounts.' });
  }
});

module.exports = router;
