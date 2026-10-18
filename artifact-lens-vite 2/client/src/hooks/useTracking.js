import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';

const POLL_MS = 10000;
const MARGIN = 0.12;

function withMargin(box) {
  const mx = box.width * MARGIN;
  const my = box.height * MARGIN;
  return {
    x: Math.max(0, box.x - mx),
    y: Math.max(0, box.y - my),
    width: box.width + mx * 2,
    height: box.height + my * 2,
  };
}

// Lightweight client-side motion heuristic gives an instant frame; the server
// classification (when reachable) decides the green/red state.
export function useTracking(videoRef, tileRef, cameraLabel, enabled = true) {
  const [objects, setObjects] = useState([]);
  const [trackingState, setTrackingState] = useState('scanning');
  const [overrideRed, setOverrideRed] = useState(() => new Set());
  const prevFrameRef = useRef(null);
  const seqRef = useRef(0);
  const lastEmitRef = useRef('');

  const forceRed = useCallback((id) => {
    setOverrideRed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, isArtifact: false } : o)));
  }, []);

  const clearOverrides = useCallback(() => {
    setOverrideRed(new Set());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let interval = null;
    let aiInFlight = false;
    let lastAiAt = 0;

    const detectMotion = () => {
      const video = videoRef.current;
      const tile = tileRef.current;
      if (!video || !tile) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      const w = 96;
      const h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      let frame;
      try {
        frame = ctx.getImageData(0, 0, w, h).data;
      } catch (err) {
        return;
      }
      const prev = prevFrameRef.current;
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i += 1) {
        gray[i] = (frame[i * 4] + frame[i * 4 + 1] + frame[i * 4 + 2]) / 3;
      }
      prevFrameRef.current = gray;
      if (!prev) return;

      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      let changed = 0;
      const colCounts = new Uint16Array(w);
      const rowCounts = new Uint16Array(h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = y * w + x;
          if (Math.abs(gray[idx] - prev[idx]) > 28) {
            changed += 1;
            colCounts[x] += 1;
            rowCounts[y] += 1;
          }
        }
      }
      if (changed < 50) {
        if (!cancelled) {
          lastEmitRef.current = '';
          setObjects((prev) => (prev.length === 0 ? prev : []));
          setTrackingState((prev) => (prev === 'scanning' ? prev : 'scanning'));
        }
        return;
      }
      // Trim sparse edges so the frame hugs the dense core of the object
      // instead of ballooning to stray pixels and shadows.
      const colNeed = Math.max(2, Math.round(h * 0.06));
      const rowNeed = Math.max(2, Math.round(w * 0.06));
      minX = w; minY = h; maxX = -1; maxY = -1;
      for (let x = 0; x < w; x += 1) {
        if (colCounts[x] >= colNeed) {
          if (x < minX) minX = x;
          maxX = x;
        }
      }
      for (let y = 0; y < h; y += 1) {
        if (rowCounts[y] >= rowNeed) {
          if (y < minY) minY = y;
          maxY = y;
        }
      }
      if (maxX < 0 || maxY < 0) {
        if (!cancelled) {
          lastEmitRef.current = '';
          setObjects((prev) => (prev.length === 0 ? prev : []));
          setTrackingState((prev) => (prev === 'scanning' ? prev : 'scanning'));
        }
        return;
      }
      const rect = tile.getBoundingClientRect();
      let nx = minX / w;
      let ny = minY / h;
      let nw = Math.max(0.08, (maxX - minX + 1) / w);
      let nh = Math.max(0.08, (maxY - minY + 1) / h);
      // Pull the box toward its own center so it sits on the item itself,
      // then cap it so a full-frame movement never fills the whole tile.
      const cx = nx + nw / 2;
      const cy = ny + nh / 2;
      nw = Math.min(nw * 0.76, 0.85);
      nh = Math.min(nh * 0.76, 0.85);
      nx = Math.min(Math.max(cx - nw / 2, 0), 1 - nw);
      ny = Math.min(Math.max(cy - nh / 2, 0), 1 - nh);
      const base = {
        x: nx * rect.width,
        y: ny * rect.height,
        width: nw * rect.width,
        height: nh * rect.height,
      };
      const padded = withMargin(base);
      seqRef.current += 1;
      const id = `motion-${seqRef.current}`;
      // Stable-ish id per region so a manual reject survives a few polls.
      const regionId = `region-${Math.round(nx * 8)}-${Math.round(ny * 8)}`;
      const rejected = overrideRed.has(regionId);
      if (!cancelled) {
        // Skip re-render when the frame hasn't meaningfully moved.
        const sig = `${regionId}|${Math.round(padded.x)}|${Math.round(padded.y)}|${Math.round(padded.width)}|${Math.round(padded.height)}`;
        if (sig !== lastEmitRef.current) {
          lastEmitRef.current = sig;
          setObjects([
            {
              id: regionId,
              rawId: id,
              label: cameraLabel || 'object',
              boundingBox: padded,
              isArtifact: rejected ? false : null,
            },
          ]);
        }
        setTrackingState((prevState) => (rejected ? 'not-artifact' : prevState === 'scanning' ? 'scanning' : prevState));
      }
    };

    const pollAi = async () => {
      const now = Date.now();
      if (aiInFlight || now - lastAiAt < POLL_MS) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      aiInFlight = true;
      lastAiAt = now;
      try {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = Math.round((320 * video.videoHeight) / video.videoWidth) || 240;
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL('image/jpeg', 0.6);
        const base64 = dataUrl.split(',').pop();
        const result = await api.identify(base64, 'image/jpeg', cameraLabel || null, true);
        if (cancelled) return;
        setObjects((prevObjs) => {
          if (prevObjs.length === 0) return prevObjs;
          return prevObjs.map((o) =>
            overrideRed.has(o.id) ? { ...o, isArtifact: false } : { ...o, isArtifact: !!result.isArtifact }
          );
        });
        setTrackingState((prevState) => {
          void prevState;
          const anyRejected = overrideRed.size > 0;
          if (anyRejected) return 'not-artifact';
          return result.isArtifact ? 'artifact' : 'not-artifact';
        });
      } catch (err) {
        // AI offline or rate hiccup: keep the motion frame, stay in scanning state.
        if (!cancelled) {
          setTrackingState((prevState) => (prevState === 'scanning' ? 'scanning' : prevState));
        }
      } finally {
        aiInFlight = false;
      }
    };

    const tick = () => {
      detectMotion();
      pollAi();
    };
    interval = setInterval(tick, 500);
    tick();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [videoRef, tileRef, cameraLabel, enabled, overrideRed]);

  return { objects, trackingState, forceRed, clearOverrides };
}
