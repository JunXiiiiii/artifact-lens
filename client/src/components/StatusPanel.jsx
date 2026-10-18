import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { motionAllowed } from '../utils/motion.js';

let panelEntered = false;

function dotClass(status) {
  if (status === 'connected' || status === 'online' || status === 'running') return 'status-dot ok';
  if (
    status === 'error' ||
    status === 'unavailable' ||
    status === 'not running' ||
    status === 'stopped'
  )
    return 'status-dot err';
  if (status === 'starting') return 'status-dot pulse';
  return 'status-dot idle';
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12h15M13 6l6 6-6 6"
        stroke="var(--accent-teal)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StatusPanel({ db, ai, viewer, onOpenArchive }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || panelEntered || !rootRef.current) return;
    panelEntered = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.status-panel',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', delay: 0.65 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await onOpenArchive();
    } catch (err) {
      setError(err.message || 'Could not start the archive viewer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef}>
      <div className="status-panel">
      <div className="status-row">
        <span className={dotClass(db.status)} />
        <span className="status-label">DB</span>
        <span className="status-value">{db.label}</span>
      </div>
      <div className="status-row">
        <span className={dotClass(ai.status)} />
        <span className="status-label">AI</span>
        <span className="status-value">{ai.label}</span>
      </div>
      <div className="status-row">
        <span className={dotClass(viewer.status)} />
        <span className="status-label">Archive</span>
        <span className="status-value">{viewer.label}</span>
      </div>
      <hr className="status-divider" />
      <button type="button" className="status-archive-btn" onClick={open} disabled={busy}>
        {busy ? 'Starting…' : 'Open Archive'}
        {!busy && <ArrowIcon />}
      </button>
      {error && <div className="al-error" style={{ marginTop: 6, fontSize: '0.75rem' }}>{error}</div>}
      </div>
    </div>
  );
}
