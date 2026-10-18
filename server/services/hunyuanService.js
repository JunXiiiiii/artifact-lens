const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const HUNYUAN_BASE_URL = process.env.HUNYUAN_BASE_URL || 'http://localhost:8080';
// Optional explicit launch command for the Hunyuan3D service, e.g.
// HUNYUAN_CMD="python /opt/Hunyuan3D-2/hy3dgen_api.py --port 8080"
// If unset, the service must be started manually (see README).
const HUNYUAN_CMD = process.env.HUNYUAN_CMD || '';
const MODELS_DIR = path.join(__dirname, '..', '..', 'storage', 'models');

let child = null;
let status = 'not running';
// Consecutive health-check failures. A single slow/timeout response (busy
// GPU, tunnel hiccup) must not flip a healthy engine to offline.
let failStreak = 0;

function ensureModelsDir() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function modelPathFor(scanId) {
  ensureModelsDir();
  return path.join(MODELS_DIR, `${scanId}.glb`);
}

async function isServiceResponding() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${HUNYUAN_BASE_URL}/health`, { signal: controller.signal });
    if (res.ok) return true;
    // Some Gradio-style servers answer on / instead of /health.
    const root = await fetch(`${HUNYUAN_BASE_URL}/`, { signal: controller.signal });
    return root.ok;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function getEngineStatus() {
  if (child && child.exitCode === null) {
    const alive = await isServiceResponding();
    status = alive ? 'online' : 'starting';
    failStreak = alive ? 0 : failStreak + 1;
    return { status };
  }
  const foreign = await isServiceResponding();
  if (foreign) {
    status = 'online';
    failStreak = 0;
    return { status };
  }
  failStreak += 1;
  // Forgive one transient failure while previously online.
  if (status === 'online' && failStreak < 2) {
    return { status: 'online', degraded: true };
  }
  status = 'offline';
  if (child && child.exitCode !== null) child = null;
  return { status };
}

function offlineError() {
  const err = new Error(
    '3D engine offline — install Hunyuan3D-2 on a GPU machine and set HUNYUAN_CMD (see README), ' +
      'or start it manually on ' + HUNYUAN_BASE_URL + '.'
  );
  err.code = 'ENGINE_OFFLINE';
  err.status = 503;
  return err;
}

async function startEngine() {
  const current = await getEngineStatus();
  if (current.status === 'online') {
    if (!child) {
      const err = new Error(
        `3D engine port is already in use by another process (${HUNYUAN_BASE_URL}).`
      );
      err.code = 'PORT_IN_USE';
      throw err;
    }
    return { status: 'online' };
  }
  if (child && child.exitCode === null) {
    return { status: 'starting' };
  }
  if (!HUNYUAN_CMD) {
    throw offlineError();
  }
  const parts = HUNYUAN_CMD.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const cmd = parts.shift();
  const args = parts.map((p) => p.replace(/^["']|["']$/g, ''));
  child = spawn(cmd, args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  status = 'starting';
  child.stdout.on('data', (d) => console.log(`[hunyuan] ${String(d).trim()}`));
  child.stderr.on('data', (d) => console.error(`[hunyuan] ${String(d).trim()}`));
  child.on('exit', (code) => {
    console.log(`[hunyuan] exited with code ${code}`);
    status = 'offline';
    child = null;
  });
  child.on('error', (err) => {
    console.error('[hunyuan] failed to start:', err.message);
    status = 'offline';
    child = null;
  });
  return { status: 'starting' };
}

function cleanBase64(v) {
  if (!v) return null;
  const s = String(v);
  return s.includes(',') ? s.split(',').pop() : s;
}

// Sends angle images to the Hunyuan3D service and stores the resulting GLB.
// angles: { front, back, left, right, top } — at least 4 non-empty base64 frames.
async function generateModel(scanId, angles, query) {
  const entries = Object.entries(angles || {}).filter(([, v]) => v);
  if (entries.length < 1) {
    const err = new Error('Capture at least 1 angle before generating a 3D model.');
    err.status = 400;
    throw err;
  }
  // Persist the captures first so a retry never loses the user's work.
  await query('UPDATE scans SET angle_captures = $1 WHERE id = $2', [
    JSON.stringify(
      Object.fromEntries(entries.map(([k, v]) => [k, cleanBase64(v)]))
    ),
    scanId,
  ]);

  const online = await isServiceResponding();
  if (!online) throw offlineError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  let glbBuffer;
  try {
    const res = await fetch(`${HUNYUAN_BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: entries.map(([angle, data]) => ({ angle, image: cleanBase64(data) })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`3D engine responded with status ${res.status}.`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('model/gltf-binary') || contentType.includes('octet-stream')) {
      const ab = await res.arrayBuffer();
      glbBuffer = Buffer.from(ab);
    } else {
      // JSON envelope variant: { glb_base64: "..." }
      const data = await res.json();
      const b64 = data.glb_base64 || data.model_base64 || data.glb;
      if (!b64) throw new Error('3D engine returned no model data.');
      glbBuffer = Buffer.from(String(b64).includes(',') ? String(b64).split(',').pop() : String(b64), 'base64');
    }
    if (glbBuffer.slice(0, 4).toString('ascii') !== 'glTF') {
      throw new Error('3D engine returned data that is not a valid GLB file.');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('3D generation timed out after 10 minutes. Try fewer angles or check the engine.');
      e.status = 504;
      throw e;
    }
    if (err.status) throw err;
    throw offlineError();
  } finally {
    clearTimeout(timeout);
  }

  const dest = modelPathFor(scanId);
  fs.writeFileSync(dest, glbBuffer);
  const rel = `storage/models/${scanId}.glb`;
  // Clear bulky captures now that the model exists; keep the lightweight record.
  await query(
    'UPDATE scans SET model_path = $1, model_generated_at = NOW(), angle_captures = NULL WHERE id = $2',
    [rel, scanId]
  );
  return { modelPath: rel, bytes: glbBuffer.length };
}

function resolveModelFile(scan) {
  if (!scan || !scan.model_path) return null;
  const abs = path.join(__dirname, '..', '..', scan.model_path);
  if (!abs.startsWith(path.join(__dirname, '..', '..', 'storage'))) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

module.exports = {
  getEngineStatus,
  startEngine,
  generateModel,
  resolveModelFile,
  modelPathFor,
  offlineError,
  HUNYUAN_BASE_URL,
};
