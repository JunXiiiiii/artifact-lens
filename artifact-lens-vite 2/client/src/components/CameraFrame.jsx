import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { motionAllowed } from '../utils/motion.js';

function stateWord(state) {
  if (state === 'artifact') return 'Artifact';
  if (state === 'not-artifact' || state === 'notArtifact') return 'Not artifact';
  return 'Scanning';
}

function stateClass(state) {
  if (state === 'artifact') return 'is-artifact';
  if (state === 'not-artifact' || state === 'notArtifact') return 'is-rejected';
  return '';
}

function dotTone(status) {
  if (status === 'connected' || status === 'online' || status === 'running') return 'ok';
  if (
    status === 'error' ||
    status === 'unavailable' ||
    status === 'offline' ||
    status === 'stopped'
  )
    return 'err';
  return 'idle';
}

// Full-viewport instrument frame. Scanning screen only.
export default function CameraFrame({ trackingState, scanCount, db, ai, engine }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.frame-corner',
        { scale: 0.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, stagger: 0.07, ease: 'power3.out', delay: 0.1 }
      );
      gsap.fromTo(
        '.frame-edge.top, .frame-edge.bottom',
        { scaleX: 0 },
        { scaleX: 1, duration: 0.6, ease: 'power3.out', delay: 0.3 }
      );
      gsap.fromTo(
        '.frame-edge.left, .frame-edge.right',
        { scaleY: 0 },
        { scaleY: 1, duration: 0.6, ease: 'power3.out', delay: 0.3 }
      );
      gsap.fromTo(
        '.frame-info',
        { opacity: 0 },
        { opacity: 0.75, duration: 0.5, stagger: 0.08, delay: 0.7 }
      );
      gsap.fromTo('.frame-vignette', { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.2 });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true">
      <div className="frame-vignette" />
      <div className={`frame-corner top-left ${stateClass(trackingState)}`} />
      <div className={`frame-corner top-right ${stateClass(trackingState)}`} />
      <div className={`frame-corner bottom-left ${stateClass(trackingState)}`} />
      <div className={`frame-corner bottom-right ${stateClass(trackingState)}`} />
      <div className="frame-edge top" />
      <div className="frame-edge bottom" />
      <div className="frame-edge left" />
      <div className="frame-edge right" />
      <div className="frame-info top-left">Artifact Lens</div>
      <div className="frame-info top-right">Scan #{String(scanCount || 0).padStart(4, '0')}</div>
      <div className="frame-info bottom-left">
        <span className={`dot ${dotTone(db.status)}`} /> DB
        <span className={`dot ${dotTone(ai.status)}`} /> AI
        <span className={`dot ${dotTone(engine.status)}`} /> 3D
      </div>
      <div className={`frame-info bottom-right ${stateClass(trackingState)}`}>
        {stateWord(trackingState)}
      </div>
    </div>
  );
}
