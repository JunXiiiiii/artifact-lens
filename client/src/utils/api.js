const TOKEN_KEY = 'artifact_lens_token';

// Base URL of the backend API. Local dev: '' (Vite proxies /api → :3000).
// Production (e.g. Vercel frontend + hosted backend): set VITE_API_URL,
// e.g. VITE_API_URL=https://your-api.example.com
const API_BASE =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  '';
const withBase = (path) => `${String(API_BASE).replace(/\/$/, '')}${path}`;

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    // storage unavailable (private mode) — app still works for the session
  }
}

export function clearToken() {
  setToken(null);
}

export function authHeaders(extra = {}) {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handleResponse(res) {
  if (res.status === 401) {
    clearToken();
    const err = new Error('Session expired. Please log in again.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status}).`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function get(path) {
  return fetch(withBase(path), { headers: authHeaders() }).then(handleResponse);
}

function send(path, method, body) {
  return fetch(withBase(path), {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(handleResponse);
}

export const api = {
  // auth
  register: (email, password, displayName) =>
    send('/api/auth/register', 'POST', { email, password, displayName }),
  login: (email, password) => send('/api/auth/login', 'POST', { email, password }),
  logout: () => send('/api/auth/logout', 'POST', {}),
  me: () => get('/api/auth/me'),

  // AI pipeline
  identify: (imageBase64, mimeType, cameraSource, classificationOnly = false) =>
    send('/api/identify', 'POST', { imageBase64, mimeType, cameraSource, classificationOnly }),

  // scans
  createScan: (payload) => send('/api/scans', 'POST', payload),
  listScans: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.account) qs.set('account', params.account);
    if (params.status) qs.set('status', params.status);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return get(`/api/scans${suffix}`);
  },
  getScan: (id) => get(`/api/scans/${id}`),
  scanCount: () => get('/api/scans/count'),
  confirmScan: (id, status) => send(`/api/scans/${id}/confirm`, 'PATCH', { status }),
  updateNotes: (id, fieldNotes) => send(`/api/scans/${id}/notes`, 'PATCH', { fieldNotes }),
  deleteScan: (id) => send(`/api/scans/${id}`, 'DELETE'),
  bulkDelete: (ids) => send('/api/scans', 'DELETE', { ids }),
  deleteAllScans: () => send('/api/scans', 'DELETE', { all: true }),

  // accounts (owner)
  listAccounts: () => get('/api/accounts'),

  // system status
  dbStatus: () => get('/api/status/db'),
  aiStatus: () => get('/api/status/ai'),
  viewerStatus: () => get('/api/status/viewer'),
  viewerStart: () => send('/api/viewer/start', 'POST', {}),
  viewerStop: () => send('/api/viewer/stop', 'POST', {}),

  // 3D engine (Hunyuan3D local service)
  engineStatus: () => get('/api/status/3d'),
  engineStart: () => send('/api/3d/start', 'POST', {}),
  generate3d: (scanId, angles) => send('/api/3d/generate', 'POST', { scanId, angles }),
  fetchModelBlob: async (scanId) => {
    const res = await fetch(withBase(`/api/3d/model/${scanId}`), { headers: authHeaders() });
    if (res.status === 401) {
      clearToken();
      const err = new Error('Session expired. Please log in again.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (!res.ok) {
      let msg = 'No 3D model available — generate one first.';
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch (err) {
        // binary or empty error body
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  downloadModel: async (scanId, filename) => {
    const res = await fetch(withBase(`/api/3d/download/${scanId}`), { headers: authHeaders() });
    if (res.status === 401) {
      clearToken();
      const err = new Error('Session expired. Please log in again.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (!res.ok) {
      const err = new Error('No 3D model available — generate one first.');
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'model.glb';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
