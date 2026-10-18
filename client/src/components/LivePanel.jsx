import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { motionAllowed } from '../utils/motion.js';

let panelPlayed = false;

function stateWord(state) {
  if (state === 'artifact') return 'Artifact detected';
  if (state === 'not-artifact') return 'Not an artifact';
  return 'Scanning';
}

function stateClass(state) {
  if (state === 'artifact') return 'live-state is-artifact';
  if (state === 'not-artifact') return 'live-state is-rejected';
  return 'live-state is-scanning';
}

export default function LivePanel({ deviceName, trackingState, objects, lastCapture, sessionScans, conveyorOn, onToggleConveyor, onOpenLibrary }) {
  const count = (objects || []).length;
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || panelPlayed || !rootRef.current) return;
    panelPlayed = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.live-panel',
        { x: 30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.35 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <aside ref={rootRef} className="live-panel" aria-label="Live scan panel">
      <section className="live-section">
        <h3 className="live-heading">Scanning live</h3>
        <div className="al-meta">{deviceName || 'No camera selected'}</div>        <div className={stateClass(trackingState)}>
          <span className="dot" aria-hidden="true" />
          {stateWord(trackingState)}
        </div>
        <div className="al-meta">
          {count === 1 ? '1 object in frame' : `${count} objects in frame`}
        </div>
        <div className="al-meta">
          {sessionScans === 1 ? '1 scan this session' : `${sessionScans || 0} scans this session`}
        </div>
        {onToggleConveyor && (
          <label className="history-select-all" style={{ cursor: 'pointer' }} title="Auto-capture and identify stable artifacts (conveyor mode)">
            <input
              type="checkbox"
              checked={!!conveyorOn}
              onChange={onToggleConveyor}
              aria-label="Toggle conveyor auto-scan"
            />
            Conveyor auto-scan
          </label>
        )}
      </section>
      <section className="live-section live-items">
        <h3 className="live-heading">Detected items</h3>
        {(objects || []).length === 0 ? (
          <p className="al-meta">Nothing in frame yet.</p>
        ) : (
          <ul className="live-list">
            {(objects || []).map((o) => (
              <li key={o.id} className="live-item">
                <span
                  className={`history-dot ${o.isArtifact === true ? 'confirmed' : o.isArtifact === false ? 'wrong' : 'unconfirmed'}`}
                  aria-hidden="true"
                />
                <span className="live-item-label">{o.label || 'object'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="live-section">
        <h3 className="live-heading">Last capture</h3>
        {lastCapture ? (
          <div>
            <div className="live-last-name">{lastCapture.identification || 'Untitled'}</div>
            <div className="live-last-age">{lastCapture.ageEstimate || 'Age unknown'}</div>
            {lastCapture.id && (
              <button type="button" className="auth-link" onClick={() => onOpenLibrary(lastCapture.id)}>
                Open in Library
              </button>
            )}
          </div>
        ) : (
          <p className="al-meta">No captures this session.</p>
        )}
      </section>
    </aside>
  );
}
