import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import CameraTile from './CameraTile.jsx';
import { motionAllowed } from '../utils/motion.js';

let tilesPlayed = false;

function WaitingTile({ onRetry }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="camera-grid is-single">
      <div className="camera-tile is-muted-corners">
        <div className="viewfinder-corner top-left" />
        <div className="viewfinder-corner top-right" />
        <div className="viewfinder-corner bottom-left" />
        <div className="viewfinder-corner bottom-right" />
        <div className="tile-waiting" style={{ flexDirection: 'column', gap: 12 }}>
          <span className="al-meta">Looking for cameras…</span>
          {slow && (
            <>
              <span className="al-meta" style={{ maxWidth: 420, lineHeight: 1.6 }}>
                Taking longer than usual — the browser may be waiting on a camera
                permission prompt, or another app may hold the camera.
              </span>
              {onRetry && (
                <button type="button" className="al-btn-gold" onClick={onRetry}>
                  Retry cameras
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CameraGrid({ cameras, error, activeDeviceId, onSelect, onCapture, onActiveTracking, onActiveData, onRetry }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || tilesPlayed || !rootRef.current) return;
    if (!cameras || cameras.length === 0) return;
    tilesPlayed = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.camera-tile',
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.5, stagger: 0.1, ease: 'power3.out', delay: 0.2 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, [cameras]);
  if (error) {
    const denied = /denied/i.test(error);
    return (
      <div style={{ padding: 32, textAlign: 'center', maxWidth: 640 }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{error}</p>
        {!denied && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Check browser permissions, then reload the page.
          </p>
        )}
        {onRetry && (
          <button type="button" className="al-btn-gold" style={{ marginTop: 12 }} onClick={onRetry}>
            Retry cameras
          </button>
        )}
      </div>
    );
  }
  if (!cameras || cameras.length === 0) {
    return (
      <WaitingTile onRetry={onRetry} />
    );
  }
  const modeClass =
    cameras.length === 1 ? 'is-single' : cameras.length === 2 ? 'is-pair' : 'is-multi';
  return (
    <div ref={rootRef} className={`camera-grid ${modeClass}`}>
      {cameras.map((cam, i) => {
        const id = cam.deviceId || `cam-${i}`;
        const isActive = activeDeviceId === id || (!activeDeviceId && i === 0);
        return (
          <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CameraTile
              camera={cam}
              active={isActive}
              onSelect={() => onSelect && onSelect(id)}
              onTrackingChange={isActive ? onActiveTracking : undefined}
              onData={isActive ? onActiveData : undefined}
            />
            <button
              type="button"
              onClick={() => onCapture && onCapture(cam, i)}
              className="al-btn-ghost-teal tile-capture-link"
            >
              Capture from {cam.label || `Camera ${i + 1}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
