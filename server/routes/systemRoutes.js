const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../auth');
const aiService = require('../services/aiService');
const viewerService = require('../services/viewerService');

const router = express.Router();

router.use(authRequired);

router.get('/status/db', async (req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ status: 'connected', message: 'PostgreSQL is reachable.' });
  } catch (err) {
    return res.json({ status: 'error', message: err.message || 'Database unreachable.' });
  }
});

router.get('/status/ai', async (req, res) => {
  const info = await aiService.checkAiStatus();
  return res.json(info);
});

router.get('/status/viewer', async (req, res) => {
  const info = await viewerService.getViewerStatus();
  return res.json(info);
});

router.get('/status/3d', async (req, res) => {
  const hunyuan = require('../services/hunyuanService');
  const info = await hunyuan.getEngineStatus();
  return res.json(info);
});

router.post('/viewer/start', async (req, res) => {
  try {
    const info = await viewerService.startViewer();
    return res.json(info);
  } catch (err) {
    if (err.code === 'PORT_IN_USE') {
      return res.status(409).json({ error: err.message });
    }
    console.error('[viewer/start]', err.message);
    return res.status(500).json({ error: 'Could not start the archive viewer.' });
  }
});

router.post('/viewer/stop', async (req, res) => {
  try {
    const info = await viewerService.stopViewer();
    return res.json(info);
  } catch (err) {
    console.error('[viewer/stop]', err.message);
    return res.status(500).json({ error: 'Could not stop the archive viewer.' });
  }
});

module.exports = router;
