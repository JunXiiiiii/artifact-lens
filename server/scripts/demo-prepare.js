// Demo-day readiness check + AI warm-up.
// Usage: npm run demo:prepare
// Verifies Postgres, Ollama, and the API, then runs one vision + one text
// call so the model is loaded and warm before the audience arrives.
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    console.log(`FAIL ${name} — ${err.message}`);
    return false;
  }
}

async function getJson(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const OLLAMA = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5vl:3b';
  const API = 'http://localhost:3000';
  let allOk = true;

  allOk = (await check('backend :3000', async () => {
    const h = await getJson(`${API}/health`);
    return h.service;
  })) && allOk;

  allOk = (await check('database (direct pool)', async () => {
    const { query, pool } = require('../db');
    await query('SELECT 1');
    const tables = await query(
      "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name IN ('accounts','scans')"
    );
    await pool.end();
    if (tables.rows[0].n < 2) throw new Error('schema missing — run npm run db:init');
    return 'reachable, schema ok';
  })) && allOk;

  allOk = (await check(`ollama ${MODEL}`, async () => {
    const tags = await getJson(`${OLLAMA}/api/tags`);
    const names = (tags.models || []).map((m) => m.name);
    if (!names.some((n) => n.startsWith(MODEL.split(':')[0]))) {
      throw new Error(`model not pulled (have: ${names.join(', ') || 'none'})`);
    }
    return 'pulled';
  })) && allOk;

  allOk = (await check('warm-up text call', async () => {
    const t0 = Date.now();
    await getJson(
      `${OLLAMA}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: 'Reply with the word OK.',
          stream: false,
          options: { num_ctx: 512, num_predict: 16 },
        }),
      },
      180000
    );
    return `${((Date.now() - t0) / 1000).toFixed(1)}s (model now loaded)`;
  })) && allOk;

  allOk = (await check('warm-up vision tower', async () => {
    // 32px test pattern: warms the visual encoder so the first live scan
    // doesn't pay the cold-start cost on stage.
    const tiny = 
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRWBuFFFFABRRRQAUUUUAf/2Q==';
    const t0 = Date.now();
    await getJson(
      `${OLLAMA}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: 'Reply with the word OK.',
          images: [tiny],
          stream: false,
          options: { num_ctx: 512, num_predict: 16 },
        }),
      },
      180000
    );
    return `${((Date.now() - t0) / 1000).toFixed(1)}s (vision tower warm)`;
  })) && allOk;

  console.log(allOk ? '\nREADY — model is warm. Do the demo within ~5 min (idle unload).' : '\nNOT READY — fix the FAIL lines above.');
  process.exit(allOk ? 0 : 1);
}

main();
