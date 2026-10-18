import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api, setToken } from '../utils/api';
import { motionAllowed } from '../utils/motion.js';

function ApertureIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--accent-gold)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" stroke="var(--accent-gold)" strokeWidth="1.5" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="var(--accent-gold)" strokeWidth="1.5" />
    </svg>
  );
}

function Field({ label, children, value }) {
  const [focused, setFocused] = useState(false);
  const floated = focused || (value !== undefined && value !== null && String(value) !== '');
  return (
    <div
      className={`vault-field${floated ? ' is-floated' : ''}${focused ? ' is-focused' : ''}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span className="vault-label">{label}</span>
      {children}
    </div>
  );
}

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!motionAllowed() || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(
          '.vault-card',
          { y: 28, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' }
        )
        .fromTo(
          '.vault-field',
          { y: 12, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.07, duration: 0.4, ease: 'power3.out' },
          0.2
        )
        .fromTo('.vault-submit', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.5);
    }, rootRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!error || !motionAllowed() || !rootRef.current) return;
    gsap.to(rootRef.current.querySelector('.vault-card'), {
      keyframes: { x: [-5, 5, -4, 4, -2, 2, 0] },
      duration: 0.4,
      ease: 'none',
    });
  }, [error]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password, displayName.trim() || undefined);
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-stage" ref={rootRef}>
      <div className="vault-hex" aria-hidden="true" />
      <div className="vault-glow" aria-hidden="true" />
      <span className="vault-line vault-line-a" aria-hidden="true" />
      <span className="vault-line vault-line-b" aria-hidden="true" />
      <div className="vault-card">
        <div className="vault-strip">
          <ApertureIcon />
          <span className="vault-stamp">Artifact Lens</span>
        </div>
        <div className="vault-body">
          <h1 className="vault-heading">Field Access</h1>
          <p className="vault-sub">
            <em>Authorised researchers only.</em>
          </p>
          <form onSubmit={submit}>
            <Field label="Email address" value={email}>
              <input
                className="vault-input"
                type="email"
                required
                placeholder="researcher@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            {mode === 'register' && (
              <Field label="Display name" value={displayName}>
                <input
                  className="vault-input"
                  type="text"
                  placeholder="Field archaeologist (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </Field>
            )}
            <Field label="Password" value={password}>
              <input
                className="vault-input"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
            {error && (
              <div className="vault-error" role="alert">
                <span className="vault-error-mark" aria-hidden="true">
                  !
                </span>
                {error}
              </div>
            )}
            <button className="vault-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="vault-arrow is-spinning" aria-hidden="true">
                    →
                  </span>
                  Verifying…
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Enter the archive' : 'Request access'}
                  <span className="vault-arrow" aria-hidden="true">
                    →
                  </span>
                </>
              )}
            </button>
          </form>
          <div className="vault-toggle">
            {mode === 'login' ? (
              <span>
                New to the archive?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="auth-link"
                >
                  Register for access
                </button>
              </span>
            ) : (
              <span>
                Already cleared?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="auth-link"
                >
                  Enter the archive
                </button>
              </span>
            )}
          </div>
          {mode === 'register' && (
            <p className="al-meta" style={{ marginTop: 12, textAlign: 'center', fontSize: '0.7rem' }}>
              Scans are attributed to your account and visible to the project owner.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
