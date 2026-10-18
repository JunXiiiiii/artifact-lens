import { useEffect, useRef } from 'react';

function strokeColor(isArtifact) {
  const root = getComputedStyle(document.documentElement);
  if (isArtifact === true) {
    return {
      main: root.getPropertyValue('--state-detected').trim() || 'rgb(76, 175, 130)',
      glow: root.getPropertyValue('--state-detected-glow').trim() || 'rgba(76,175,130,0.35)',
    };
  }
  if (isArtifact === false) {
    return {
      main: root.getPropertyValue('--state-rejected').trim() || 'rgb(201, 64, 64)',
      glow: root.getPropertyValue('--state-rejected-glow').trim() || 'rgba(201,64,64,0.35)',
    };
  }
  return {
    main: root.getPropertyValue('--accent-teal').trim() || 'rgb(95, 166, 156)',
    glow: 'rgba(95,166,156,0.25)',
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function TrackingOverlay({ tileRef, objects, onReject }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tile = tileRef.current;
    if (!canvas || !tile) return;
    const rect = tile.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    objects.forEach((obj) => {
      const b = obj.boundingBox;
      const { main, glow } = strokeColor(obj.isArtifact);
      // Soft glow pass: wider low-opacity stroke beneath the crisp frame.
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, b.x, b.y, b.width, b.height, 4);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      // Technical frame: thin dashed lines between animated-looking corner dots.
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, b.x, b.y, b.width, b.height, 4);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = main;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = main;
      const corners = [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      // Confidence dot at the top-right of the frame.
      ctx.globalAlpha = obj.isArtifact === true ? 0.9 : 0.5;
      ctx.beginPath();
      ctx.arc(b.x + b.width - 4, b.y + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (obj.label) {
        ctx.font = '11px "JetBrains Mono", monospace';
        const label = obj.isArtifact === true ? `artifact · ${obj.label}` : obj.label;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(26,23,18,0.85)';
        ctx.fillRect(b.x, Math.max(0, b.y - 20), tw + 12, 18);
        ctx.fillStyle = main;
        ctx.fillText(label, b.x + 6, Math.max(10, b.y - 7));
      }
    });
  }, [objects, tileRef]);

  return (
    <>
      <canvas ref={canvasRef} className="tracking-layer" />
      {objects.map((obj) => (
        <button
          key={obj.id}
          type="button"
          className="bbox-reject"
          title="Reject this frame"
          aria-label="Reject this detection"
          style={{ left: obj.boundingBox.x + obj.boundingBox.width, top: obj.boundingBox.y }}
          onClick={(e) => {
            e.stopPropagation();
            if (onReject) onReject(obj.id);
          }}
        >
          ×
        </button>
      ))}
    </>
  );
}
