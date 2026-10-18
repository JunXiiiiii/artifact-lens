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

export default function AdminView({ onSessionExpired }) {
  const [scans, setScans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const listRef = useRef(null);

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
      const params = {};
      if (accountFilter) params.account = accountFilter;
      if (statusFilter) params.status = statusFilter;
      params.limit = 200;
      const [scanData, accountData] = await Promise.all([api.listScans(params), api.listAccounts()]);
      setScans(scanData);
      setAccounts(accountData);
      setSelected(new Set());
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') {
        onSessionExpired(err.message);
        return;
      }
      setError(err.message || 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountFilter, statusFilter]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.type === 'all') {
        await api.deleteAllScans();
      } else if (pendingDelete.type === 'one') {
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

  if (loading) return <div className="history-wrap"><p className="al-meta">Loading admin view…</p></div>;

  return (
    <div className="history-wrap" ref={listRef}>
      <h2 className="history-heading">Archive — All Records</h2>
      <div className="admin-filters">
        <select className="al-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filter by account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email} ({a.scanCount})
            </option>
          ))}
        </select>
        <select className="al-input" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by confirmation status">
          <option value="">All statuses</option>
          <option>Unconfirmed</option>
          <option>Confirmed correct</option>
          <option>Marked wrong</option>
        </select>
        {selected.size > 0 && (
          <button type="button" className="al-btn-danger" onClick={() => setPendingDelete({ type: 'many', ids: Array.from(selected) })}>
            Delete selected ({selected.size})
          </button>
        )}
        <button type="button" className="al-btn-outline-rejected" onClick={() => setPendingDelete({ type: 'all', ids: [] })}>
          Delete all
        </button>
      </div>
      {error && <p className="al-error">{error}</p>}
      {scans.length === 0 && !error && <p className="al-meta">No scans match this filter.</p>}
      {scans.map((s) => (
        <div key={s.id} className="history-row">
          <span className="row-check">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              aria-label={`Select ${s.identification || 'record'}`}
            />
          </span>
          <span className="history-account">{s.accountEmail || s.accountDisplayName || ''}</span>
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
            onClick={() => setPendingDelete({ type: 'one', ids: [s.id] })}
            style={{ color: 'var(--state-rejected)', fontSize: 15 }}
          >
            🗑
          </button>
        </div>
      ))}
      {pendingDelete && (
        <DeleteConfirm
          count={pendingDelete.type === 'all' ? 'all' : pendingDelete.ids.length}
          onCancel={() => setPendingDelete(null)}
          onConfirm={doDelete}
        />
      )}
    </div>
  );
}
