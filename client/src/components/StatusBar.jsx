import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { motionAllowed } from '../utils/motion.js';

let barPlayed = false;

function useMissionClock() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T+${hh}:${mm}:${ss}`;
}

function Indicator({ label, value, tone }) {
  return (
    <span className="statusbar-item">
      <span className={`status-dot ${tone}`} aria-hidden="true" />
      <span className="statusbar-label">{label}</span>
      <span className={valueTone(tone)}>{value}</span>
    </span>
  );
}

function toneFor(status) {
  if (status === 'connected' || status === 'online' || status === 'running') return 'ok';
  if (status === 'error' || status === 'unavailable' || status === 'offline' || status === 'stopped') return 'err';
  if (status === 'starting') return 'pulse';
  return 'idle';
}

function valueTone(tone) {
  if (tone === 'ok') return 'statusbar-value is-ok';
  if (tone === 'err') return 'statusbar-value is-err';
  return 'statusbar-value';
}

export default function StatusBar({ db, ai, engine, viewer, onOpenArchive, onStartEngine, onLibrary, onLogout }) {
  const clock = useMissionClock();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || barPlayed || !rootRef.current) return;
    barPlayed = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.statusbar',
        { y: 36 },
        { y: 0, duration: 0.45, ease: 'power3.out', delay: 0.5 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <footer ref={rootRef} className="statusbar">
      <div className="statusbar-group">
        <span className="statusbar-item">
          <span className="statusbar-value is-clock">{clock}</span>
        </span>
        <Indicator label="DB" value={db.label} tone={toneFor(db.status)} />
        <Indicator label="AI" value={ai.label} tone={toneFor(ai.status)} />
        <span className="statusbar-item">
          <span className={`status-dot ${toneFor(engine.status)}`} aria-hidden="true" />
          <span className="statusbar-label">3D Engine</span>
          <span className={valueTone(toneFor(engine.status))}>{engine.label}</span>
          {engine.status === 'offline' && (
            <button type="button" className="statusbar-mini" onClick={onStartEngine} title="Start the 3D engine">
              Start
            </button>
          )}
        </span>
        <Indicator label="Archive" value={viewer.label} tone={toneFor(viewer.status)} />
      </div>
      <div className="statusbar-group">
        <button type="button" className="statusbar-link is-teal" onClick={onOpenArchive}>
          Open Archive
        </button>
        <button type="button" className="statusbar-link" onClick={onLibrary}>
          Library
        </button>
        <button type="button" className="statusbar-link is-muted" onClick={onLogout}>
          Logout
        </button>
      </div>
    </footer>
  );
}
