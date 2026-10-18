const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signToken, authRequired } = require('../auth');

const router = express.Router();

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const normalized = String(email).trim().toLowerCase();
    const existing = await query('SELECT id FROM accounts WHERE email = $1', [normalized]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const role = normalized === String(process.env.OWNER_EMAIL || '').trim().toLowerCase() && normalized !== ''
      ? 'owner'
      : 'consumer';
    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await query(
      'INSERT INTO accounts (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, role',
      [normalized, passwordHash, displayName ? String(displayName) : null, role]
    );
    const user = toPublicUser(result.rows[0]);
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('[auth/register]', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const normalized = String(email).trim().toLowerCase();
    const result = await query('SELECT id, email, password_hash, display_name, role FROM accounts WHERE email = $1', [normalized]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = toPublicUser(row);
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/login]', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  return res.json({ ok: true });
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await query('SELECT id, email, display_name, role FROM accounts WHERE id = $1', [req.user.userId]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.json(toPublicUser(result.rows[0]));
  } catch (err) {
    console.error('[auth/me]', err.message);
    return res.status(500).json({ error: 'Could not load profile.' });
  }
});

module.exports = router;
