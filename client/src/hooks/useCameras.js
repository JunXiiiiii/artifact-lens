import { useCallback, useEffect, useRef, useState } from 'react';

// A camera call must never hang forever (locked camera / unanswered
// permission prompt). Race it against a timer instead.
function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function useCameras(enabled = true) {
  const [cameras, setCameras] = useState([]);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const streamsRef = useRef([]);
  const busyRef = useRef(false);
  const fingerprintRef = useRef('');
  const debounceRef = useRef(null);

  const stopAllStreams = useCallback(() => {    streamsRef.current.forEach((s) => {
      try {
        s.getTracks().forEach((t) => t.stop());
      } catch (err) {
        // ignore cleanup errors
      }
    });
    streamsRef.current = [];
  }, []);

  const enumerate = useCallback(async () => {
    // Guard: opening streams fires devicechange on some browsers — never
    // re-enter while an enumeration is in flight.
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setError('Camera API is not available in this browser.');
        return;
      }
      let devices = await withTimeout(
        navigator.mediaDevices.enumerateDevices(),
        15000,
        'Camera lookup timed out.'
      );
      let videoInputs = devices.filter((d) => d.kind === 'videoinput');
      if (videoInputs.length === 0) {
        // Prompting for a stream can reveal devices hidden behind permissions.
        try {
          const tmp = await withTimeout(
            navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
            15000,
            'Camera request timed out.'
          );
          tmp.getTracks().forEach((t) => t.stop());
          devices = await withTimeout(
            navigator.mediaDevices.enumerateDevices(),
            15000,
            'Camera lookup timed out.'
          );
          videoInputs = devices.filter((d) => d.kind === 'videoinput');
        } catch (err) {
          if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
            setPermissionDenied(true);
            setError('Camera access denied. Please allow camera permissions and reload.');
            return;
          }
          if (err && err.name === 'TimeoutError') {
            setError(
              'Still waiting for camera access — allow the permission prompt, or quit any app using the camera (Zoom, Teams, FaceTime), then reload.'
            );
            return;
          }
        }
      }
      if (videoInputs.length === 0) {
        setError('No cameras detected. Connect a camera and reload.');
        setCameras([]);
        fingerprintRef.current = '';
        return;
      }

      // If the device list is unchanged and every stream is still live, this
      // was a spurious devicechange — keep the tiles exactly as they are.
      const fingerprint = videoInputs
        .map((d) => `${d.deviceId || ''}|${d.label || ''}`)
        .sort()
        .join(';');
      const streamsAlive =
        streamsRef.current.length > 0 &&
        streamsRef.current.every((s) => {
          try {
            return s.active && s.getVideoTracks().some((t) => t.readyState === 'live');
          } catch (err) {
            return false;
          }
        });
      if (fingerprint && fingerprint === fingerprintRef.current && streamsAlive) {
        setError(null);
        setPermissionDenied(false);
        return;
      }
      fingerprintRef.current = fingerprint;
      setError(null);
      setPermissionDenied(false);

      // Open one stream per device so every tile is live.
      stopAllStreams();
      const next = [];
      for (const device of videoInputs) {
        const tryOpen = (withId) =>
          withTimeout(
            navigator.mediaDevices.getUserMedia({
              video:
                withId && device.deviceId ? { deviceId: { exact: device.deviceId } } : true,
              audio: false,
            }),
            20000,
            'Camera did not respond.'
          );
        try {
          let stream;
          try {
            stream = await tryOpen(true);
          } catch (err) {
            // Safari quirk: an exact deviceId it just reported can still be
            // rejected — fall back to an unconstrained request once.
            if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
              stream = await tryOpen(false);
            } else {
              throw err;
            }
          }
          next.push({
            deviceId: device.deviceId,
            label: device.label || `Camera ${next.length + 1}`,
            stream,
          });
          streamsRef.current.push(stream);
        } catch (err) {
          if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
            setPermissionDenied(true);
            setError('Camera access denied. Please allow camera permissions and reload.');
            return;
          }
          next.push({
            deviceId: device.deviceId,
            label: device.label || `Camera ${next.length + 1}`,
            stream: null,
            error:
              err && err.name === 'TimeoutError'
                ? 'Camera did not respond. Quit any app using it (Zoom, Teams, FaceTime) and reload.'
                : 'Could not open this camera. It may be in use by another app.',
            errorName: (err && err.name) || 'UnknownError',
          });
        }
      }
      setCameras(next);
    } catch (err) {
      setError('Could not list cameras. Reload and try again.');
    } finally {
      busyRef.current = false;
    }
  }, [stopAllStreams]);

  useEffect(() => {
    if (!enabled) return;
    enumerate();
    // Debounced: opening our own streams can emit devicechange bursts.
    const onChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        enumerate();
      }, 1200);
    };
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onChange);
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onChange);
      }
      stopAllStreams();
    };
  }, [enumerate, enabled, stopAllStreams]);

  // Manual retry: force-clear all guards so it can never no-op on stale state.
  const refresh = useCallback(() => {
    busyRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return enumerate();
  }, [enumerate]);

  return { cameras, error, permissionDenied, refresh };
}
