function statusBadge(status) {
  if (status === 'Confirmed correct') return 'al-badge al-badge-detected';
  if (status === 'Marked wrong') return 'al-badge al-badge-rejected';
  return 'al-badge al-badge-stone';
}

export default function HistoryGrid({ scans, onOpen }) {
  if (!scans || scans.length === 0) {
    return <p className="al-meta">No scans to display.</p>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
        width: '100%',
        maxWidth: 1000,
        padding: 16,
      }}
    >
      {scans.map((s) => (
        <div
          key={s.id}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onClick={onOpen ? () => onOpen(s.id) : undefined}
          onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(s.id); } : undefined}
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--terrain-stone)',
            borderRadius: 'var(--radius-card)',
            padding: 16,
            cursor: onOpen ? 'pointer' : 'default',
          }}
        >
          {s.imageData && (
            <img
              src={s.imageData}
              alt=""
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--terrain-stone)',
                marginBottom: 10,
                display: 'block',
              }}
            />
          )}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--accent-gold)',
              fontSize: 17,
              marginBottom: 6,
            }}
          >
            {s.identification || 'Untitled'}
          </div>
          <div className="al-meta" style={{ marginBottom: 8 }}>
            {s.ageEstimate || 'Age unknown'}
          </div>
          <span className={statusBadge(s.confirmationStatus)}>{s.confirmationStatus}</span>
          <div className="al-meta" style={{ marginTop: 8 }}>
            {s.timestamp ? new Date(s.timestamp).toLocaleString() : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
