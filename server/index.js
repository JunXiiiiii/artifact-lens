const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const { authRequired } = require('./auth');
const aiService = require('./services/aiService');

const authRoutes = require('./routes/authRoutes');
const scanRoutes = require('./routes/scanRoutes');
const accountRoutes = require('./routes/accountRoutes');
const systemRoutes = require('./routes/systemRoutes');
const threeRoutes = require('./routes/threeRoutes');

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'artifact-lens' }));

app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api', systemRoutes);
app.use('/api', threeRoutes);

app.post('/api/identify', authRequired, async (req, res) => {
  try {
    const { imageBase64, mimeType, cameraSource, classificationOnly } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required.' });
    }
    const result = await aiService.identifyArtifact(String(imageBase64), {
      classificationOnly: classificationOnly === true,
    });
    return res.json({ ...result, cameraSource: cameraSource || null, mimeType: mimeType || null });
  } catch (err) {
    console.error('[identify]', err.message);
    const message = err.message || 'Identification failed. Try again.';
    const status = message.startsWith('AI unavailable') ? 503 : 502;
    return res.status(status).json({ error: message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server]', err);
  return res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  try {
    await initDb();
    console.log('[server] Database schema ready.');
  } catch (err) {
    console.error('[server] Database init failed:', err.message);
    console.error('[server] The API will still start, but DB features will report offline.');
  }
  app.listen(PORT, () => {
    console.log(`[server] Artifact Lens API listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
// health check fix
