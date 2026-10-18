import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api } from '../utils/api';
import { motionAllowed } from '../utils/motion.js';
import ModelViewer from './ModelViewer.jsx';

gsap.registerPlugin(ScrollTrigger);

const PERIODS = [
  { name: 'Paleolithic', date: 'c. 3.3M BCE', keys: ['paleolithic', 'stone age', 'old stone'] },
  { name: 'Neolithic', date: 'c. 10,000 BCE', keys: ['neolithic', 'new stone'] },
  { name: 'Bronze Age', date: 'c. 3300 BCE', keys: ['bronze'] },
  { name: 'Iron Age', date: 'c. 1200 BCE', keys: ['iron age'] },
  { name: 'Classical', date: 'c. 500 BCE', keys: ['classical', 'greek', 'greece', 'roman', 'rome', 'hellenistic'] },
  { name: 'Medieval', date: 'c. 500 CE', keys: ['medieval', 'middle ages', 'byzantine'] },
  { name: 'Early Modern', date: 'c. 1500 CE', keys: ['renaissance', 'early modern', 'ottoman', 'colonial'] },
  { name: 'Modern', date: 'c. 1800 CE', keys: ['modern', 'victorian', 'industrial', '19th', '20th'] },
];

function matchPeriodIndex(scan) {
  const text = `${scan.ageEstimate || ''} ${scan.eraCulture || ''}`.toLowerCase();
  for (let i = 0; i < PERIODS.length; i += 1) {
    if (PERIODS[i].keys.some((k) => text.includes(k))) return i;
  }
  return -1;
}

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIDE_ITEMS = [
  { key: 'identity', label: 'Identity', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4M12 15v.5' },
  { key: 'age', label: 'Age', icon: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2' },
  { key: 'match', label: 'Match', icon: 'M10 4a6 6 0 104.2 10.3L20 20M14 14l6 6' },
  { key: 'origin', label: 'Origin', icon: 'M12 21s-6-5.3-6-10a6 6 0 0112 0c0 4.7-6 10-6 10zM12 12.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z' },
  { key: 'condition', label: 'Condition', icon: 'M12 3l2.2 5.4L20 9.2l-4.4 4 1.2 5.8-4.8-2.8-4.8 2.8 1.2-5.8L4 9.2l5.8-.8z' },
  { key: 'summary', label: 'Summary', icon: 'M5 5h14M5 10h14M5 15h9M5 20h6' },
  { key: 'model', label: '3D Model', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9' },
  { key: 'download', label: 'Download', icon: 'M12 4v11M7 11l5 5 5-5M5 20h14' },
];

function conditionClass(condition) {
  if (condition === 'Pristine' || condition === 'Good') return 'var(--state-detected)';
  if (condition === 'Damaged' || condition === 'Fragmentary') return 'var(--state-rejected)';
  return 'var(--terrain-sand)';
}

export default function LibraryView({
  scan,
  onRescan,
  onToast,
  onSessionExpired,
  onUpdateScan,
  onGenerate3D,
}) {
  const [active, setActive] = useState('identity');
  const [notes, setNotes] = useState(scan.fieldNotes || '');
  const [notesBusy, setNotesBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const sectionRefs = useRef({});
  const centreRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.library-side-btn',
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, stagger: 0.06, duration: 0.4, ease: 'power3.out', delay: 0.3 }
      );
      gsap.utils.toArray('.library-data .lib-section').forEach((section) => {
        gsap.fromTo(
          section,
          { opacity: 0, y: 18 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: section,
              scroller: '.library-data',
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
          }
        );
      });
      gsap.fromTo(
        '.period-list',
        { scaleY: 0, transformOrigin: 'top center' },
        {
          scaleY: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.period-list',
            scroller: '.library-data',
            start: 'top 80%',
          },
        }
      );
      gsap.fromTo(
        '.period-dot',
        { scale: 0 },
        {
          scale: 1,
          stagger: 0.09,
          duration: 0.3,
          ease: 'back.out(1.5)',
          scrollTrigger: {
            trigger: '.period-list',
            scroller: '.library-data',
            start: 'top 80%',
          },
        }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const go = (key) => {
    setActive(key);
    if (key === 'model' && centreRef.current) {
      centreRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const el = sectionRefs.current[key];
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const setRef = (key) => (el) => {
    sectionRefs.current[key] = el;
  };

  const fail = (err, fallback) => {
    if (err && err.code === 'UNAUTHORIZED' && onSessionExpired) {
      onSessionExpired(err.message);
      return;
    }
    if (onToast) onToast(err.message || fallback);
  };

  const confirm = async (status) => {
    setConfirmBusy(true);
    try {
      const updated = await api.confirmScan(scan.id, status);
      if (onUpdateScan) onUpdateScan(updated);
      if (onToast) onToast(status === 'Confirmed correct' ? 'Confirmed correct' : 'Marked wrong');
    } catch (err) {
      fail(err, 'Could not update confirmation.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const saveNotes = async () => {
    setNotesBusy(true);
    try {
      const updated = await api.updateNotes(scan.id, notes);
      if (onUpdateScan) onUpdateScan(updated);
      if (onToast) onToast('Field notes saved');
    } catch (err) {
      fail(err, 'Could not save field notes.');
    } finally {
      setNotesBusy(false);
    }
  };

  const share = async () => {
    const link = `${window.location.origin}${window.location.pathname}#library-${scan.id}`;
    try {
      await navigator.clipboard.writeText(link);
      if (onToast) onToast('Link copied');
    } catch (err) {
      if (onToast) onToast(link);
    }
  };

  const download = async () => {
    try {
      const filename = `${String(scan.identification || 'model').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'model'}.glb`;
      await api.downloadModel(scan.id, filename);
      if (onToast) onToast('model.glb downloaded');
    } catch (err) {
      fail(err, 'No 3D model available — generate one first.');
    }
  };

  const periodIdx = matchPeriodIndex(scan);
  const hasModel = !!scan.modelPath;

  return (
    <div className="library-layout" ref={rootRef}>
      <nav className="library-side" aria-label="Profile sections">
        {SIDE_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`library-side-btn${active === item.key ? ' is-active' : ''}`}
            onClick={() => go(item.key)}
          >
            <Icon d={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="library-centre" ref={centreRef}>
        <ModelViewer
          scanId={scan.id}
          modelAvailable={hasModel}
          caption={{
            id: `Specimen ${String(scan.id).slice(0, 8).toUpperCase()}`,
            era: scan.eraCulture || scan.ageEstimate || 'Unclassified',
          }}
          onGenerate={() => onGenerate3D && onGenerate3D(scan)}
          onSessionExpired={onSessionExpired}
        />
      </div>

      <div className="library-data">
        <section className="lib-section" ref={setRef('identity')}>
          <h2 className="lib-name">{scan.identification || 'Untitled artifact'}</h2>
          <span className="al-badge al-badge-teal">{scan.confirmationStatus || 'Unconfirmed'}</span>
          <hr className="lib-rule" />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="al-btn-outline-detected" style={{ fontSize: '0.8rem', padding: '8px 12px' }} disabled={confirmBusy} onClick={() => confirm('Confirmed correct')}>
              Confirm correct
            </button>
            <button type="button" className="al-btn-outline-rejected" style={{ fontSize: '0.8rem', padding: '8px 12px' }} disabled={confirmBusy} onClick={() => confirm('Marked wrong')}>
              Mark wrong
            </button>
          </div>
        </section>

        <section className="lib-section" ref={setRef('age')}>
          <div className="record-field-label">Age estimate</div>
          <div className="lib-age">{scan.ageEstimate || 'Unknown'}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            {scan.ageConfidence && (
              <span className={`al-badge ${scan.ageConfidence === 'High' ? 'al-badge-detected' : scan.ageConfidence === 'Medium' ? 'al-badge-warning' : 'al-badge-stone'}`}>
                {scan.ageConfidence}
              </span>
            )}
            {scan.eraCulture && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{scan.eraCulture}</span>}
          </div>
          <ol className="period-list">
            {PERIODS.map((p, i) => (
              <li key={p.name} className={`period-row${i === periodIdx ? ' is-hit' : ''}`}>
                <span className="period-dot" aria-hidden="true" />
                <span className="period-name">{p.name.toUpperCase()}</span>
                <span className="period-date">{p.date}</span>
              </li>
            ))}
            <li className={`period-row${periodIdx === -1 ? ' is-hit' : ''}`}>
              <span className="period-dot" aria-hidden="true" />
              <span className="period-name">Artifact period</span>
              <span className="period-date">{scan.ageEstimate || 'estimated'}</span>
            </li>
          </ol>
        </section>

        <section className="lib-section" ref={setRef('match')}>
          <div className="record-field-label">Match</div>
          <div className="record-field-value">
            {scan.matchName || 'No close match found'}{' '}
            {scan.matchSourceUrl && (
              <a href={scan.matchSourceUrl} target="_blank" rel="noreferrer">
                source ↗
              </a>
            )}
          </div>
        </section>

        <section className="lib-section" ref={setRef('origin')}>
          <div className="record-field-label">Origin</div>
          <div className="record-field-value">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }}>
              <path d="M12 21s-6-5.3-6-10a6 6 0 0112 0c0 4.7-6 10-6 10z" stroke="var(--accent-teal)" strokeWidth="1.8" />
              <circle cx="12" cy="11" r="1.8" stroke="var(--accent-teal)" strokeWidth="1.8" />
            </svg>
            {scan.origin || 'Unknown'}
            {scan.originConfidence && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {scan.originConfidence}</span>
            )}
          </div>
        </section>

        <section className="lib-section" ref={setRef('condition')}>
          <div className="record-field-label">Condition</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: conditionClass(scan.condition) }}>
            {scan.condition || 'Unknown'}
          </div>
          {scan.conditionRationale && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{scan.conditionRationale}</p>
          )}
        </section>

        <section className="lib-section" ref={setRef('summary')}>
          <div className="record-field-label">Summary</div>
          <div className="record-summary" style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
            {scan.summary || 'No summary recorded.'}
          </div>
        </section>

        <section className="lib-section" ref={setRef('download')}>
          <div className="record-field-label">Files available</div>
          <button
            type="button"
            className="al-btn-ghost-teal"
            disabled={!hasModel}
            onClick={download}
            title={hasModel ? undefined : 'No 3D model available — generate one first'}
            style={!hasModel ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {hasModel ? 'Download 3D Model (.glb)' : 'No 3D model available — generate one first'}
          </button>
          {scan.imageData && (
            <img
              src={scan.imageData}
              alt="Captured artifact"
              style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--terrain-stone)', marginTop: 12, display: 'block' }}
            />
          )}
        </section>

        <section className="lib-section" ref={setRef('notes')}>
          <div className="record-field-label">Field notes</div>
          <textarea
            id="library-notes"
            className="notes-area"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Personal field notes for this artifact…"
          />
          <div style={{ marginTop: 12 }}>
            <button type="button" className="al-btn-gold" disabled={notesBusy} onClick={saveNotes}>
              {notesBusy ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </section>
      </div>

      <div className="library-util">
        <button type="button" className="library-util-btn" onClick={share} title="Copy shareable link">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>Share</span>
        </button>
        <button type="button" className="library-util-btn" onClick={download} disabled={!hasModel} title={hasModel ? 'Download GLB' : 'No 3D model yet'}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Download</span>
        </button>
        <button type="button" className="library-util-btn" onClick={() => onRescan && onRescan(scan)} title="Re-open scanner">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12a8 8 0 0114-5M20 12a8 8 0 01-14 5M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Rescan</span>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="library-util-btn"
            onClick={() => go('notes')}
            title="Field notes"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 4h14v12H5zM5 16l-2 4 4-2M9 9h6M9 12.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Notes</span>
          </button>
        </div>
      </div>
    </div>
  );
}
