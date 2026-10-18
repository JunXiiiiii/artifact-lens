const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { authRequired } = require('../auth');
const hunyuan = require('../services/hunyuanService');

const router = express.Router();

router.use(authRequired);

async function loadOwnedScan(req, res) {
  const found = await query('SELECT * FROM scans WHERE id = $1', [req.params.scanId]);
  if (found.rowCount === 0) {
    res.status(404).json({ error: 'Record not found — it may have already been deleted.' });
    return null;
  }
  const scan = found.rows[0];
  if (req.user.role !== 'owner' && scan.account_id !== req.user.userId) {
    res.status(403).json({ error: 'Access denied.' });
    return null;
  }
  return scan;
}

router.post('/3d/start', async (req, res) => {
  try {
    const info = await hunyuan.startEngine();
    return res.json(info);
  } catch (err) {
    if (err.code === 'PORT_IN_USE') {
      return res.status(409).json({ error: err.message });
    }
    if (err.code === 'ENGINE_OFFLINE') {
      return res.status(503).json({ error: err.message });
    }
    console.error('[3d/start]', err.message);
    return res.status(500).json({ error: 'Could not start the 3D engine.' });
  }
});

router.post('/3d/generate', async (req, res) => {
  try {
    const { scanId, angles } = req.body || {};
    if (!scanId) {
      return res.status(400).json({ error: 'scanId is required.' });
    }
    const scan = await loadOwnedScan({ ...req, params: { scanId } }, res);
    if (!scan) return;
    const result = await hunyuan.generateModel(scanId, angles, query);
    return res.json({ scanId, ...result });
  } catch (err) {
    console.error('[3d/generate]', err.message);
    return res.status(err.status || 500).json({ error: err.message || '3D generation failed.' });
  }
});

function sendGlb(req, res, asAttachment) {
  loadOwnedScan(req, res)
    .then((scan) => {
      if (!scan) return;
      const file = hunyuan.resolveModelFile(scan);
      if (!file) {
        res.status(404).json({ error: 'No 3D model available — generate one first.' });
        return;
      }
      const filename = `${String(scan.identification || 'model').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'model'}.glb`;
      res.setHeader('Content-Type', 'model/gltf-binary');
      if (asAttachment) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      }
      fs.createReadStream(file).pipe(res);
    })
    .catch((err) => {
      console.error('[3d/download]', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Could not serve the 3D model.' });
    });
}

router.get('/3d/download/:scanId', (req, res) => sendGlb(req, res, true));
router.get('/3d/model/:scanId', (req, res) => sendGlb(req, res, false));

module.exports = router;
