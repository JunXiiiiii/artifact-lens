import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from '../utils/api';
import { motionAllowed } from '../utils/motion.js';
import DeleteConfirm from './DeleteConfirm.jsx';

function dotClass(status) {
  if (status === 'Confirmed correct') return 'history-dot confirmed';
  if (status === 'Marked wrong') return 'history-dot wrong';
  return 'history-dot unconfirmed';
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"
        stroke="var(--terrain-stone)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="history-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" opacity="0.4">
        <circle cx="24" cy="24" r="18" stroke="var(--terrain-stone)" strokeWidth="2" />
        <path d="M30 18 L22 22 L18 30 L26 26 Z" stroke="var(--terrain-stone)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="24" cy="24" r="2" fill="var(--terrain-stone)" />
      </svg>
      <div className="t">No field records yet.</div>
      <div className="s">Scan an artifact to create your first record.</div>
    </div>
  );
}

export default function HistoryList({ onSessionExpired, refreshKey, onOpenLibrary }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const listRef = useRef(null);
  const rowEls = useRef({});

  useEffect(() => {
    if (!motionAllowed() || !listRef.current || scans.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.history-row',
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, stagger: 0.045, duration: 0.35, ease: 'power3.out' }
      );
    }, listRef);
    return () => ctx.revert();
  }, [scans]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listScans({ limit: 100 });
      setScans(data);
      setSelected(new Set());
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onSessionExpired(err.message);
        return;
      }
      setError(err.message || 'Could not load history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === scans.length && scans.length > 0) setSelected(new Set());
    else setSelected(new Set(scans.map((s) => s.id)));
  };

  const collapseRows = (ids) =>
    new Promise((resolve) => {
      if (!motionAllowed()) {
        resolve();
        return;
      }
      const els = ids.map((id) => rowEls.current[id]).filter(Boolean);
      if (els.length === 0) {
        resolve();
        return;
      }
      gsap.to(els, {
        opacity: 0,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: resolve,
      });
    });

  const doDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete.ids;
    try {
      await collapseRows(pendingDelete.type === 'all' ? scans.map((s) => s.id) : ids);
      if (pendingDelete.type === 'one') {
        await api.deleteScan(pendingDelete.ids[0]);
      } else {
        await api.bulkDelete(pendingDelete.ids);
      }
      setPendingDelete(null);
      load();
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onSessionExpired(err.message);
        return;
      }
      setError(err.message || 'Delete failed.');
      setPendingDelete(null);
    }
  };

  const openRecord = (id) => {
    if (onOpenLibrary) onOpenLibrary(id);
  };

  if (loading) return <div className="history-wrap"><p className="al-meta">Loading history…</p></div>;

  return (
    <div className="history-wrap">
      <h2 className="history-heading">Field Records</h2>
      <div className="history-toolbar">
        <label className="history-select-all">
          <input
            type="checkbox"
            checked={scans.length > 0 && selected.size === scans.length}
            onChange={toggleAll}
            aria-label="Select all records"
          />
          Select all
        </label>
        {selected.size > 0 && (
          <button
            type="button"
            className="al-btn-danger"
            onClick={() => setPendingDelete({ type: 'many', ids: Array.from(selected) })}
          >
            Delete selected ({selected.size})
          </button>
        )}
        <span className="al-meta" style={{ marginLeft: 'auto' }}>{scans.length} records</span>
      </div>
      {error && <p className="al-error">{error}</p>}
      {scans.length === 0 && !error ? (
        <EmptyState />
      ) : (
        <div ref={listRef}>
        {scans.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) rowEls.current[s.id] = el;
              else delete rowEls.current[s.id];
            }}
            className="history-row"
            onClick={() => openRecord(s.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openRecord(s.id);
            }}
          >
            <span
              className="row-check"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                aria-label={`Select ${s.identification || 'record'}`}
              />
            </span>
            <span className={dotClass(s.confirmationStatus)} aria-hidden="true" />
            {s.imageData ? (
              <img
                src={s.imageData}
                alt=""
                style={{
                  width: 48,
                  height: 48,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--terrain-stone)',
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--terrain-stone)',
                  background: 'var(--surface-base)',
                  flexShrink: 0,
                }}
              />
            )}
            <span className="history-name">{s.identification || 'Untitled'}</span>
            <span className="history-age">{s.ageEstimate || 'Age unknown'}</span>
            <span className="history-date">
              {s.timestamp ? new Date(s.timestamp).toLocaleDateString() : ''}
            </span>
            <button
              type="button"
              className="row-delete"
              title="Delete record"
              aria-label={`Delete ${s.identification || 'record'}`}
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete({ type: 'one', ids: [s.id] });
              }}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        </div>
      )}
      {pendingDelete && (
        <DeleteConfirm
          count={pendingDelete.ids.length}
          onCancel={() => setPendingDelete(null)}
          onConfirm={doDelete}
        />
      )}
    </div>
  );
}
