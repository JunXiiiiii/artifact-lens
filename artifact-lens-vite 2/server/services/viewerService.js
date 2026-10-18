const path = require('path');
const { spawn } = require('child_process');

const VIEWER_PORT = Number(process.env.VIEWER_PORT || 8181);

let child = null;
let status = 'not running';

function viewerBaseUrl() {
  return `http://localhost:${VIEWER_PORT}`;
}

async function isPortResponding() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${viewerBaseUrl()}/health`, { signal: controller.signal });
    return res.ok;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function getViewerStatus() {
  if (child && child.exitCode === null) {
    const alive = await isPortResponding();
    status = alive ? 'running' : 'starting';
    return { status };
  }
  const foreign = await isPortResponding();
  if (foreign) {
    status = 'running';
    return { status };
  }
  status = 'not running';
  if (child && child.exitCode !== null) child = null;
  return { status };
}

async function startViewer() {
  const current = await getViewerStatus();
  if (current.status === 'running') {
    if (!child) {
      const err = new Error('Port 8181 is already in use. Check if another process is running on that port.');
      err.code = 'PORT_IN_USE';
      throw err;
    }
    return { status: 'running' };
  }
  if (child && child.exitCode === null) {
    return { status: 'starting' };
  }
  const serverPath = path.join(__dirname, '..', '..', 'viewer', 'server.js');
  child = spawn(process.execPath, [serverPath], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  status = 'starting';
  child.stdout.on('data', (d) => console.log(`[viewer] ${String(d).trim()}`));
  child.stderr.on('data', (d) => console.error(`[viewer] ${String(d).trim()}`));
  child.on('exit', (code) => {
    console.log(`[viewer] exited with code ${code}`);
    if (status !== 'not running') status = 'not running';
    child = null;
  });
  child.on('error', (err) => {
    console.error('[viewer] failed to start:', err.message);
    status = 'not running';
    child = null;
  });
  return { status: 'starting' };
}

async function stopViewer() {
  if (child && child.exitCode === null) {
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (err) {
          // already dead
        }
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      try {
        child.kill('SIGTERM');
      } catch (err) {
        clearTimeout(t);
        resolve();
      }
    });
    child = null;
  }
  status = 'not running';
  return { status: 'stopped' };
}

module.exports = { startViewer, stopViewer, getViewerStatus, isPortResponding, VIEWER_PORT };
