import { useEffect, useRef } from 'react';
import { useTracking } from '../hooks/useTracking.js';
import TrackingOverlay from './TrackingOverlay.jsx';

function badgeClass(state) {
  if (state === 'artifact') return 'tracking-badge artifact';
  if (state === 'not-artifact') return 'tracking-badge not-artifact';
  return 'tracking-badge scanning';
}

function badgeText(state) {
  if (state === 'artifact') return 'Artifact detected';
  if (state === 'not-artifact') return 'Not artifact';
  return 'Scanning';
}

export default function CameraTile({ camera, active, onSelect, onTrackingChange, onData }) {
  const videoRef = useRef(null);
  const tileRef = useRef(null);
  const { objects, trackingState, forceRed } = useTracking(
    videoRef,
    tileRef,
    camera.label,
    !!camera.stream
  );

  useEffect(() => {
    if (onTrackingChange) onTrackingChange(trackingState);
  }, [trackingState, onTrackingChange]);

  useEffect(() => {
    if (onData) onData({ state: trackingState, objects });
  }, [trackingState, objects, onData]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (camera.stream) {
      video.srcObject = camera.stream;
      video.play().catch(() => {});
    }
    return () => {
      try {
        video.srcObject = null;
      } catch (err) {
        // ignore
      }
    };
  }, [camera.stream]);

  const hasStream = !!camera.stream;
  const tileClass = [
    'camera-tile',
    active ? 'is-active' : '',
    trackingState === 'artifact' ? 'focus-lock' : '',
    !hasStream ? 'is-muted-corners' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={tileRef}
      className={tileClass}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={camera.label || 'Camera'}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {hasStream ? (
        <video ref={videoRef} autoPlay muted playsInline />
      ) : camera.error ? (
        <div className="tile-nosignal">
          <span className="t">No camera signal</span>
          <span className="s">{camera.error}</span>
          {camera.errorName && (
            <span className="s" style={{ opacity: 0.7 }}>
              ({camera.errorName})
            </span>
          )}
        </div>
      ) : (
        <div className="tile-waiting">
          <span className="al-meta">Waiting for feed…</span>
        </div>
      )}
      <div className="viewfinder-corner top-left" />
      <div className="viewfinder-corner top-right" />
      <div className="viewfinder-corner bottom-left" />
      <div className="viewfinder-corner bottom-right" />
      <div className="viewfinder-outer outer-tl" aria-hidden="true" />
      <div className="viewfinder-outer outer-tr" aria-hidden="true" />
      <div className="viewfinder-outer outer-bl" aria-hidden="true" />
      <div className="viewfinder-outer outer-br" aria-hidden="true" />
      <div className="tile-reticle" aria-hidden="true" />
      <div className="tile-vignette" aria-hidden="true" />
      {hasStream && (
        <div className="tile-rec" aria-label="Live feed">
          <span className="rec-dot" aria-hidden="true" />
          Live
        </div>
      )}
      <div className={badgeClass(trackingState)}>
        <span className="dot" aria-hidden="true" />
        {badgeText(trackingState)}
      </div>
      <div className="device-name">{camera.label}</div>
      <TrackingOverlay tileRef={tileRef} objects={objects} onReject={forceRed} />
    </div>
  );
}
