import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';

const PHRASES = [
  'Examining object…',
  'Consulting the archive…',
  'Estimating age…',
  'Composing field notes…',
];

function ApertureGlyph() {
  return (
    <svg className="aperture-spinner" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M20 4 A16 16 0 0 1 36 20"
        stroke="var(--accent-gold)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="15" stroke="rgba(140,133,120,0.3)" strokeWidth="1.5" />
    </svg>
  );
}

export default function ConfirmCapture({ capture, aiOnline, autoStart, onCancel, onIdentified }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!busy) {
      setPhraseIdx(0);
      return;
    }
    const t = setInterval(() => setPhraseIdx((i) => (i + 1) % PHRASES.length), 2000);
    return () => clearInterval(t);
  }, [busy]);

  // Conveyor mode skips the manual review step.
  useEffect(() => {
    if (capture && autoStart && aiOnline && !autoStarted.current) {
      autoStarted.current = true;
      usePhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture, autoStart, aiOnline]);

  if (!capture) return null;

  const usePhoto = async () => {
    if (!aiOnline) {
      setError('AI unavailable — start Ollama and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Downscale for the AI: full frames waste vision tokens (slower,
      // more RAM) with zero identification gain past ~768px.
      const src = capture.dataUrl;
      const downscaled = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 768;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          if (scale >= 1) {
            resolve(src.split(',').pop());
            return;
          }
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.75).split(',').pop());
        };
        img.onerror = () => resolve(src.split(',').pop());
        img.src = src;
      });
      const result = await api.identify(downscaled, 'image/jpeg', capture.cameraSource || null, false);
      onIdentified(result);
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onCancel(true);
        return;
      }
      setError(err.message || 'Identification failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="al-modal-backdrop">
      <div className="al-modal" style={{ textAlign: 'center' }}>
        <img className="confirm-frame" src={capture.dataUrl} alt="Captured artifact" />
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            margin: '16px 0 6px',
          }}
        >
          Review your capture
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
          Confirm to identify this artifact, or retake if the angle or lighting isn&apos;t right.
        </p>
        {capture.cameraSource && <p className="al-meta">{capture.cameraSource}</p>}
        {!aiOnline && <p className="al-error">AI unavailable — start Ollama to identify this photo.</p>}
        {error && <p className="al-error">{error}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button type="button" className="al-btn-gold" style={{ flex: 1 }} onClick={usePhoto} disabled={busy}>
            {busy ? 'Identifying…' : 'Use this photo'}
          </button>
          <button
            type="button"
            className="al-btn-outline-stone"
            style={{ flex: 1 }}
            onClick={() => onCancel(false)}
            disabled={busy}
          >
            Retake
          </button>
        </div>
      </div>
      {busy && (
        <div className="ai-processing" role="status" aria-live="polite">
          <ApertureGlyph />
          <div className="ai-phrase" key={phraseIdx}>
            {PHRASES[phraseIdx]}
          </div>
        </div>
      )}
    </div>
  );
}
