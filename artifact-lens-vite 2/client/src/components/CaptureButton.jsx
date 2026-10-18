export default function CaptureButton({ trackingState, aiOnline, onCapture }) {
  const emphasized = trackingState === 'artifact';
  const cls = `capture-button${emphasized ? ' ready' : ''}${aiOnline ? '' : ' unavailable'}`;
  return (
    <div className="capture-wrap">
      <button
        type="button"
        className={cls}
        title={aiOnline ? undefined : 'AI unavailable'}
        onClick={onCapture}
        disabled={!aiOnline}
      >
        <svg className="capture-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="var(--surface-base)" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.5" stroke="var(--surface-base)" strokeWidth="2" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="var(--surface-base)" strokeWidth="2" />
        </svg>
        Capture artifact
      </button>
    </div>
  );
}
