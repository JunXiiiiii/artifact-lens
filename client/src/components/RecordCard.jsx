import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from '../utils/api';
import { motionAllowed } from '../utils/motion.js';

function conditionBadge(condition) {
  if (condition === 'Pristine' || condition === 'Good') return 'al-badge al-badge-detected';
  if (condition === 'Worn' || condition === 'Restored') return 'al-badge al-badge-sand';
  return 'al-badge al-badge-rejected';
}

function confidenceBadge(level) {
  if (level === 'High') return 'al-badge al-badge-detected';
  if (level === 'Medium') return 'al-badge al-badge-warning';
  return 'al-badge al-badge-stone';
}

export default function RecordCard({ identification, savedId, cameraSource, engineOnline, onOpen3D, onSaved, onClose }) {
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(null);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  // The one reveal: iris (CSS) + oversized name settling + staggered fields.
  useEffect(() => {
    if (!motionAllowed() || !rootRef.current || identification.isArtifact === false) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(
        '.record-name',
        { scale: 1.35, transformOrigin: 'left center' },
        { scale: 1, duration: 0.5, ease: 'power3.out' },
        0.1
      )
        .fromTo(
          '.rn-char',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, stagger: 0.022, duration: 0.3, ease: 'power3.out' },
          0.2
        )
        .fromTo(
          '.record-age',
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.3, ease: 'power3.out' },
          0.45
        )
        .fromTo(
          '.record-field',
          { opacity: 0 },
          { opacity: 1, stagger: 0.06, duration: 0.25 },
          0.6
        )
        .fromTo('.record-summary', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.85)
        .fromTo(
          '.record-confirm',
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.25 },
          1.1
        );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  if (!identification) return null;

  if (identification.isArtifact === false) {
    return (
      <div className="al-modal-backdrop">
        <div className="al-modal" style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-gold)', marginTop: 0 }}>
            Not an artifact
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{identification.step1ObjectRead}</p>
          <p className="al-meta">{identification.classification}</p>
          <button type="button" className="al-btn-outline-stone" onClick={() => onClose(false)}>
            Back to camera
          </button>
        </div>
      </div>
    );
  }

  const saveAndConfirm = async (status) => {
    setBusy(true);
    setPressed(status);
    setError(null);
    try {
      const payload = {
        cameraSource: cameraSource || identification.cameraSource || null,
        step1ObjectRead: identification.step1ObjectRead || null,
        identification: identification.identification || null,
        ageEstimate: identification.ageEstimate || null,
        ageConfidence: identification.ageConfidence || null,
        matchName: identification.matchName || null,
        matchSourceUrl: identification.matchSourceUrl || null,
        eraCulture: identification.eraCulture || null,
        condition: identification.condition || null,
        conditionRationale: identification.conditionRationale || null,
        origin: identification.origin || null,
        originConfidence: identification.originConfidence || null,
        summary: identification.summary || null,
        confirmationStatus: status,
        imageData: identification.imageDataUrl || identification.imageData || null,
      };
      let id = savedId;
      if (!id) {
        const created = await api.createScan(payload);
        id = created.id;
        if (onSaved) onSaved(created);
      } else {
        const updated = await api.confirmScan(id, status);
        if (onSaved) onSaved(updated);
      }
      onClose(true);
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onClose(true);
        return;
      }
      setError(err.message || 'Could not save the record.');
    } finally {
      setBusy(false);
    }
  };

  const correctCls = `al-btn-outline-detected${pressed === 'Confirmed correct' ? ' is-pressed' : ''}${
    pressed === 'Marked wrong' ? ' is-dimmed' : ''
  }`;
  const wrongCls = `al-btn-outline-rejected${pressed === 'Marked wrong' ? ' is-pressed' : ''}${
    pressed === 'Confirmed correct' ? ' is-dimmed' : ''
  }`;

  return (
    <div className="al-modal-backdrop">
      <div className="record-card" ref={rootRef}>
        <div className="record-strip">
          <span className="record-stamp">Artifact Lens</span>
          {identification.eraCulture && (
            <span className="al-badge al-badge-teal">{identification.eraCulture}</span>
          )}
        </div>

        <div className="record-hero">
          {(identification.imageDataUrl || identification.imageData) && (
            <img
              src={identification.imageDataUrl || identification.imageData}
              alt={identification.identification || 'Captured artifact'}
              style={{
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--terrain-stone)',
                marginBottom: 'var(--space-3)',
                display: 'block',
              }}
            />
          )}
          <h2 className="record-name" aria-label={identification.identification || 'Unidentified artifact'}>
            {String(identification.identification || 'Unidentified artifact')
              .split('')
              .map((ch, i) => (
                <span key={i} className="rn-char" aria-hidden="true">
                  {ch === ' ' ? ' ' : ch}
                </span>
              ))}
          </h2>
          <div className="record-age" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="record-age">{identification.ageEstimate || 'Age unknown'}</span>
            {identification.ageConfidence && (
              <span className={confidenceBadge(identification.ageConfidence)}>
                {identification.ageConfidence}
              </span>
            )}
          </div>
        </div>

        <div className="record-data">
          {(identification.matchName || identification.matchSourceUrl) && (
            <div className="record-field">
              <div className="record-field-label">Match</div>
              <div className="record-field-value">
                {identification.matchName}{' '}
                {identification.matchSourceUrl && (
                  <a href={identification.matchSourceUrl} target="_blank" rel="noreferrer">
                    source
                  </a>
                )}
              </div>
            </div>
          )}
          {identification.condition && (
            <div className="record-field">
              <div className="record-field-label">Condition</div>
              <div className="record-field-value" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={conditionBadge(identification.condition)}>
                  {identification.condition}
                </span>
                <span>{identification.conditionRationale}</span>
              </div>
            </div>
          )}
          {identification.origin && (
            <div className="record-field">
              <div className="record-field-label">Origin</div>
              <div className="record-field-value" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{identification.origin}</span>
                {identification.originConfidence && (
                  <span className={confidenceBadge(identification.originConfidence)}>
                    {identification.originConfidence}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {identification.summary && <div className="record-summary">{identification.summary}</div>}

        {error && <p className="al-error" style={{ padding: '0 20px' }}>{error}</p>}

        <div className="record-confirm">
          <button type="button" className={correctCls} disabled={busy} onClick={() => saveAndConfirm('Confirmed correct')}>
            {pressed === 'Confirmed correct' ? '✓ Confirm correct' : 'Confirm correct'}
          </button>
          <button type="button" className={wrongCls} disabled={busy} onClick={() => saveAndConfirm('Marked wrong')}>
            {pressed === 'Marked wrong' ? '✗ Mark wrong' : 'Mark wrong'}
          </button>
        </div>
        {savedId && onOpen3D && (
          <div style={{ padding: '0 20px 20px' }}>
            <button
              type="button"
              className="al-btn-ghost-teal"
              style={{ width: '100%', padding: '12px', opacity: engineOnline ? 1 : 0.5 }}
              disabled={!engineOnline}
              title={engineOnline ? undefined : '3D engine offline — start it from the status panel'}
              onClick={() => onOpen3D(savedId)}
            >
              Generate 3D Model
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
