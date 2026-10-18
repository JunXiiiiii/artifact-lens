import { useState } from 'react';
import { api } from '../utils/api';

export default function MultiAngleCapture({ scanId, engineOnline, engineLabel, onRefreshEngine, fallbackImage, onCaptureFrame, onClose, onGenerated }) {
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  const canGenerate = !!image && engineOnline && !busy;

  const recheck = async () => {
    if (!onRefreshEngine) return;
    setChecking(true);
    try {
      await onRefreshEngine();
    } finally {
      setChecking(false);
    }
  };

  const captureAngle = () => {
    setError(null);
    setInfo(null);
    const frame = onCaptureFrame ? onCaptureFrame() : null;
    if (frame) {
      setImage(frame);
      return;
    }
    // No live camera on screen (e.g. opened from the Library) — reuse the
    // scan's saved photo instead of failing.
    if (fallbackImage) {
      setImage(fallbackImage);
      setInfo('Using the scan’s saved photo (no live camera on this screen).');
      return;
    }
    setError('No live camera frame available. Check that a camera is streaming.');
  };

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.generate3d(scanId, { front: image });
      if (onGenerated) onGenerated(result);
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onClose(true);
        return;
      }
      setError(err.message || '3D generation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="al-modal-backdrop">
      <div className="al-modal" style={{ maxWidth: 560, textAlign: 'center' }}>
        <div className="al-meta" style={{ letterSpacing: '0.2em', color: 'var(--accent-teal)' }}>
          Generate 3D model
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          One photo is all it takes — hold the artifact up to the camera and capture.
        </p>
        {image && (
          <img
            src={image}
            alt="Angle for 3D generation"
            style={{
              width: '100%',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--terrain-stone)',
              marginTop: 16,
              display: 'block',
            }}
          />
        )}
        {error && <p className="al-error">{error}</p>}
        {info && <p className="al-meta" style={{ marginTop: 8 }}>{info}</p>}
        <p className="al-meta" style={{ marginTop: 8 }}>
          3D Engine: {engineOnline ? 'Online' : engineLabel || 'Offline'}{' '}
          {!engineOnline && onRefreshEngine && (
            <button type="button" className="auth-link" onClick={recheck} disabled={checking || busy}>
              {checking ? 'Checking…' : 'Recheck'}
            </button>
          )}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button type="button" className="al-btn-outline-stone" style={{ flex: 1 }} onClick={captureAngle} disabled={busy}>
            {image ? 'Retake photo' : 'Capture photo'}
          </button>
          <button
            type="button"
            className="al-btn-gold"
            style={{ flex: 1 }}
            onClick={generate}
            disabled={!canGenerate}
            title={!engineOnline ? '3D engine offline — start it from the status panel' : undefined}
          >
            {busy ? 'Building 3D model…' : 'Generate 3D Model'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button type="button" className="auth-link" onClick={() => onClose(false)} disabled={busy}>
            Close
          </button>
        </div>
      </div>
      {busy && (
        <div className="ai-processing" role="status" aria-live="polite">
          <svg className="aperture-spinner" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M20 4 A16 16 0 0 1 36 20" stroke="var(--accent-gold)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="20" cy="20" r="15" stroke="rgba(140,133,120,0.3)" strokeWidth="1.5" />
          </svg>
          <div className="ai-phrase">Building 3D model from your photo…</div>
        </div>
      )}
    </div>
  );
}
