import { useEffect, useState } from 'react';

const ARM_DELAY_MS = 1500;

export default function DeleteConfirm({ count, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const label = count === 'all' ? 'all records' : count === 1 ? '1 record' : `${count} records`;
  const heading = count === 'all' ? 'Delete all records?' : `Delete ${label}?`;

  const confirm = async () => {
    if (!armed) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="al-modal-backdrop" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
      <div className="al-modal delete-modal">
        <h2>{heading}</h2>
        <p>This cannot be undone. The record and all its data will be permanently removed.</p>
        <div className="delete-actions">
          <button type="button" className="al-btn-outline-stone" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`delete-armed${armed ? ' is-live' : ''}`}
            onClick={confirm}
            disabled={busy || !armed}
            title={armed ? undefined : 'Take a moment before deleting'}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
