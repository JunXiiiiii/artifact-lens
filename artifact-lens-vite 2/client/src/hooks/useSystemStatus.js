import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';

const POLL_MS = 10000;
const VIEWER_PORT = 8181;

export function useSystemStatus(enabled = true) {
  const [db, setDb] = useState({ status: 'checking', label: 'Checking' });
  const [ai, setAi] = useState({ status: 'checking', label: 'Checking' });
  const [viewer, setViewer] = useState({ status: 'checking', label: 'Checking' });
  const [engine, setEngine] = useState({ status: 'checking', label: 'Checking' });

  const refresh = useCallback(async () => {
    try {
      const r = await api.dbStatus();
      setDb(
        r.status === 'connected'
          ? { status: 'connected', label: 'Online' }
          : { status: 'error', label: 'Offline' }
      );
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') return;
      setDb({ status: 'error', label: 'Offline' });
    }
    try {
      const r = await api.aiStatus();
      setAi(
        r.status === 'online'
          ? { status: 'online', label: 'Online', model: r.model }
          : { status: 'unavailable', label: 'Offline', model: r.model }
      );
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') return;
      setAi({ status: 'unavailable', label: 'Offline' });
    }
    try {
      const r = await api.viewerStatus();
      const map = {
        running: 'Running',
        'not running': 'Not running',
        starting: 'Starting',
      };
      setViewer({ status: r.status, label: map[r.status] || r.status });
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') return;
      setViewer({ status: 'not running', label: 'Not running' });
    }
    try {
      const r = await api.engineStatus();
      const map = { online: 'Online', offline: 'Offline', starting: 'Starting' };
      setEngine({ status: r.status, label: map[r.status] || r.status });
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') return;
      setEngine({ status: 'offline', label: 'Offline' });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    refresh();
    const t = setInterval(() => {
      if (!cancelled) refresh();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, refresh]);

  const startViewer = useCallback(async () => {
    // Open the tab synchronously inside the click gesture — Safari blocks
    // window.open() once an await has yielded.
    let win = null;
    try {
      win = window.open('', '_blank', 'noopener');
    } catch (err) {
      win = null;
    }
    const token = (() => {
      try {
        return localStorage.getItem('artifact_lens_token') || '';
      } catch (err) {
        return '';
      }
    })();
    const url = `http://localhost:${VIEWER_PORT}/${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    try {
      const info = await api.viewerStart();
      setViewer({ status: info.status || 'starting', label: 'Starting' });
      if (win && !win.closed) {
        win.location.href = url;
      } else {
        // Popup blocked: the viewer is starting anyway — tell the user where.
        const blocked = new Error(
          'Popup blocked — the archive is starting. Open http://localhost:8181 in a new tab.'
        );
        blocked.code = 'POPUP_BLOCKED';
        throw blocked;
      }
      setTimeout(refresh, 2500);
      return info;
    } catch (err) {
      try {
        if (win && !win.closed) win.close();
      } catch (closeErr) {
        // ignore
      }
      throw err;
    }
  }, [refresh]);

  const stopViewer = useCallback(async () => {
    const info = await api.viewerStop();
    setViewer({ status: 'not running', label: 'Not running' });
    return info;
  }, []);

  const startEngine = useCallback(async () => {
    const info = await api.engineStart();
    const map = { online: 'Online', offline: 'Offline', starting: 'Starting' };
    setEngine({ status: info.status || 'starting', label: map[info.status] || info.status });
    setTimeout(refresh, 3000);
    return info;
  }, [refresh]);

  return { db, ai, viewer, engine, refresh, startViewer, stopViewer, startEngine };
}
