import { useCallback, useEffect, useRef, useState } from 'react';
import AuthPage from './components/AuthPage.jsx';
import CameraGrid from './components/CameraGrid.jsx';
import CaptureButton from './components/CaptureButton.jsx';
import ConfirmCapture from './components/ConfirmCapture.jsx';
import RecordCard from './components/RecordCard.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import StatusBar from './components/StatusBar.jsx';
import LivePanel from './components/LivePanel.jsx';
import HistoryList from './components/HistoryList.jsx';
import HistoryGrid from './components/HistoryGrid.jsx';
import AdminView from './components/AdminView.jsx';
import LibraryView from './components/LibraryView.jsx';
import MultiAngleCapture from './components/MultiAngleCapture.jsx';
import { api, clearToken, getToken } from './utils/api';
import { useCameras } from './hooks/useCameras.js';
import { useSystemStatus } from './hooks/useSystemStatus.js';

function Toast({ message }) {
  if (!message) return null;
  return <div className="al-toast">{message}</div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMessage, setAuthMessage] = useState(null);
  const [view, setView] = useState('scanner');
  const [historyMode, setHistoryMode] = useState('list');
  const [gridScans, setGridScans] = useState([]);
  const [libraryScans, setLibraryScans] = useState([]);
  const [libraryScanId, setLibraryScanId] = useState(null);
  const [libraryScan, setLibraryScan] = useState(null);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [activeTracking, setActiveTracking] = useState('scanning');
  const [activeObjects, setActiveObjects] = useState([]);
  const [capture, setCapture] = useState(null);
  const [identification, setIdentification] = useState(null);
  const [savedScan, setSavedScan] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [lastCapture, setLastCapture] = useState(null);
  const [sessionScans, setSessionScans] = useState(0);
  const [anglesFor, setAnglesFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [conveyorOn, setConveyorOn] = useState(false);
  const [autoIdentify, setAutoIdentify] = useState(false);
  const gridRef = useRef(null);
  const activeBoxRef = useRef(null);
  const conveyorArmedRef = useRef(true);
  const conveyorLastRef = useRef(0);
  activeBoxRef.current =
    activeObjects && activeObjects.length > 0 ? activeObjects[0].boundingBox || null : null;
  const toastTimer = useRef(null);

  const loggedIn = !!user;
  const { cameras, error: cameraError, refresh: refreshCameras } = useCameras(loggedIn);
  const { db, ai, viewer, engine, refresh, startViewer, startEngine } = useSystemStatus(loggedIn);
  const aiOnline = ai.status === 'online';
  const engineOnline = engine.status === 'online';

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const sameObjects = useCallback((a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((o, i) => {
      const p = b[i];
      if (!p || o.id !== p.id || o.isArtifact !== p.isArtifact) return false;
      const ab = o.boundingBox || {};
      const pb = p.boundingBox || {};
      return (
        Math.round(ab.x) === Math.round(pb.x) &&
        Math.round(ab.y) === Math.round(pb.y) &&
        Math.round(ab.width) === Math.round(pb.width) &&
        Math.round(ab.height) === Math.round(pb.height)
      );
    });
  }, []);

  // Stable callbacks: tracking fires every poll, but App only re-renders
  // when something actually changed — no render churn, no tile remounts.
  const handleActiveTracking = useCallback((state) => {
    setActiveTracking((prev) => (prev === state ? prev : state));
  }, []);

  const handleActiveData = useCallback(
    (d) => {
      handleActiveTracking(d.state);
      const objs = d.objects || [];
      setActiveObjects((prev) => (sameObjects(prev, objs) ? prev : objs));
    },
    [handleActiveTracking, sameObjects]
  );

  const handleSessionExpired = useCallback((message) => {
    clearToken();
    setUser(null);
    setView('scanner');
    setCapture(null);
    setIdentification(null);
    setLibraryScanId(null);
    setLibraryScan(null);
    setAuthMessage(message || 'Session expired. Please log in again.');
  }, []);

  useEffect(() => {
    const boot = async () => {
      if (!getToken()) {
        setAuthChecked(true);
        return;
      }
      try {
        const me = await api.me();
        setUser(me);
      } catch (err) {
        setAuthMessage(err.message || 'Session expired. Please log in again.');
        clearToken();
      } finally {
        setAuthChecked(true);
      }
    };
    boot();
  }, []);

  const openLibrary = useCallback(
    async (id) => {
      try {
        const scan = await api.getScan(id);
        setLibraryScan(scan);
        setLibraryScanId(id);
        setView('library');
        try {
          window.location.hash = `library-${id}`;
        } catch (err) {
          // hash is a nicety, not a requirement
        }
      } catch (err) {
        if (err && err.code === 'UNAUTHORIZED') handleSessionExpired(err.message);
        else showToast(err.message || 'Could not open the record.');
      }
    },
    [handleSessionExpired, showToast]
  );

  // Deep link: #library-<id> opens that artifact profile after login.
  useEffect(() => {
    if (!loggedIn) return;
    const m = window.location.hash.match(/#library-([0-9a-f-]{36})/i);
    if (m) openLibrary(m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const captureFrame = useCallback(
    (box) => {
      const grid = gridRef.current;
      const videos = grid
        ? grid.querySelectorAll('.camera-tile video')
        : document.querySelectorAll('.camera-tile video');
      let index = cameras.findIndex((c, i) => (c.deviceId || `cam-${i}`) === activeDeviceId);
      if (index < 0) index = 0;
      const video = videos[index];
      if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
      // Crop to the tracked object box (tile pixels) so the background never
      // reaches the AI or the 3D model. Falls back to the full frame.
      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      try {
        const tile = video.closest('.camera-tile');
        const rect = tile ? tile.getBoundingClientRect() : null;
        if (box && rect && rect.width > 0 && rect.height > 0) {
          const kx = video.videoWidth / rect.width;
          const ky = video.videoHeight / rect.height;
          const pad = 0.06;
          const pw = box.width * (1 + pad * 2);
          const ph = box.height * (1 + pad * 2);
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          sx = Math.max(0, (cx - pw / 2) * kx);
          sy = Math.max(0, (cy - ph / 2) * ky);
          sw = Math.min(video.videoWidth - sx, pw * kx);
          sh = Math.min(video.videoHeight - sy, ph * ky);
          if (sw < 16 || sh < 16) {
            sx = 0;
            sy = 0;
            sw = video.videoWidth;
            sh = video.videoHeight;
          }
        }
      } catch (err) {
        sx = 0;
        sy = 0;
        sw = video.videoWidth;
        sh = video.videoHeight;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    },
    [cameras, activeDeviceId]
  );

  const captureFromTile = useCallback(
    (cam, index) => {
      const dataUrl = captureFrame(activeBoxRef.current);
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const thumb = document.createElement('canvas');
        thumb.width = Math.max(1, Math.round(img.width * scale));
        thumb.height = Math.max(1, Math.round(img.height * scale));
        thumb.getContext('2d').drawImage(img, 0, 0, thumb.width, thumb.height);
        const thumbDataUrl = thumb.toDataURL('image/jpeg', 0.7);
        setCapture({ dataUrl, thumbDataUrl, cameraSource: cam.label || `Camera ${index + 1}` });
      };
      img.src = dataUrl;
    },
    [captureFrame]
  );

  const captureActive = useCallback(() => {
    let index = cameras.findIndex((c, i) => (c.deviceId || `cam-${i}`) === activeDeviceId);
    if (index < 0) index = 0;
    const cam = cameras[index];
    if (cam) captureFromTile(cam, index);
  }, [cameras, activeDeviceId, captureFromTile]);

  // Conveyor mode: a stable artifact auto-captures and auto-identifies.
  // Re-arms only after the artifact leaves frame (plus a cooldown).
  useEffect(() => {
    if (!conveyorOn) {
      conveyorArmedRef.current = true;
      return;
    }
    if (activeTracking !== 'artifact') {
      conveyorArmedRef.current = true;
      setAutoIdentify(false);
      return;
    }
    if (view !== 'scanner' || capture || identification || anglesFor) return;
    if (!conveyorArmedRef.current) return;
    if (Date.now() - conveyorLastRef.current < 20000) return;
    conveyorArmedRef.current = false;
    conveyorLastRef.current = Date.now();
    setAutoIdentify(true);
    captureActive();
  }, [conveyorOn, activeTracking, view, capture, identification, anglesFor, captureActive]);

  const loadGridScans = useCallback(async () => {
    try {
      const data = await api.listScans({ limit: 100 });
      setGridScans(data);
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') handleSessionExpired(err.message);
    }
  }, [handleSessionExpired]);

  const loadLibraryScans = useCallback(async () => {
    try {
      const data = await api.listScans({ limit: 100 });
      setLibraryScans(data);
    } catch (err) {
      if (err && err.code === 'UNAUTHORIZED') handleSessionExpired(err.message);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    if (loggedIn && view === 'records' && historyMode === 'grid') loadGridScans();
  }, [loggedIn, view, historyMode, historyKey, loadGridScans]);

  useEffect(() => {
    if (loggedIn && view === 'library' && !libraryScanId) loadLibraryScans();
  }, [loggedIn, view, libraryScanId, historyKey, loadLibraryScans]);

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      // logout is best-effort; token is cleared regardless
    }
    clearToken();
    setUser(null);
    setView('scanner');
    setCapture(null);
    setIdentification(null);
    setSavedScan(null);
    setLibraryScanId(null);
    setLibraryScan(null);
  };

  const goLibraryIndex = () => {
    setLibraryScanId(null);
    setLibraryScan(null);
    try {
      window.location.hash = '';
    } catch (err) {
      // ignore
    }
    setView('library');
  };

  if (!authChecked) {
    return (
      <div style={{ padding: 48 }}>
        <p className="al-meta">Loading Artifact Lens…</p>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <>
        {authMessage && (
          <div className="al-error" style={{ paddingTop: 24, textAlign: 'center', width: '100%' }}>
            {authMessage}
          </div>
        )}
        <AuthPage
          onAuth={(u) => {
            setUser(u);
            setAuthMessage(null);
          }}
        />
      </>
    );
  }

  const isOwner = user.role === 'owner';
  const activeCam =
    cameras.find((c, i) => (c.deviceId || `cam-${i}`) === activeDeviceId) || cameras[0];

  const openArchive = async () => {
    try {
      await startViewer();
    } catch (err) {
      showToast(err.message || 'Could not start the archive viewer.');
    }
  };

  const start3d = async () => {
    try {
      await startEngine();
    } catch (err) {
      showToast(err.message || 'Could not start the 3D engine.');
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {view === 'library' && libraryScan ? (
        <>
          <nav className="library-nav">
            <span className="al-brand-stamp">Artifact Lens</span>
            <div className="library-links">
              <button type="button" className="al-tab is-active" onClick={goLibraryIndex}>
                Library
              </button>
              <button type="button" className="al-tab" onClick={() => setView('scanner')}>
                Scanner
              </button>
              <button type="button" className="al-tab" onClick={() => setView('records')}>
                Records
              </button>
              <span className="al-meta" style={{ alignSelf: 'center' }}>
                {user.displayName || user.email}
              </span>
            </div>
          </nav>
          <LibraryView
            scan={libraryScan}
            onRescan={() => setView('scanner')}
            onToast={showToast}
            onSessionExpired={handleSessionExpired}
            onUpdateScan={(s) => {
              setLibraryScan(s);
              setHistoryKey((k) => k + 1);
            }}
            onGenerate3D={(s) => setAnglesFor({ id: s.id, identification: s.identification, imageData: s.imageData || null })}
          />
        </>
      ) : (
        <header className="al-topbar">
          <span className="al-brand-stamp">Artifact Lens</span>
          <nav className="al-tabs" aria-label="Views">
            <button
              type="button"
              className={`al-tab${view === 'library' ? ' is-active' : ''}`}
              onClick={goLibraryIndex}
            >
              Library
            </button>
            <button
              type="button"
              className={`al-tab${view === 'scanner' ? ' is-active' : ''}`}
              onClick={() => setView('scanner')}
            >
              Scanner
            </button>
            <button
              type="button"
              className={`al-tab${view === 'records' ? ' is-active' : ''}`}
              onClick={() => setView('records')}
            >
              Records
            </button>
            {isOwner && (
              <button
                type="button"
                className={`al-tab${view === 'admin' ? ' is-active' : ''}`}
                onClick={() => setView('admin')}
              >
                Admin
              </button>
            )}
          </nav>
          <div className="al-userbox">
            <span className="al-meta">
              {user.displayName || user.email} · {user.role}
            </span>
            <button type="button" className="al-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
      )}

      {view === 'scanner' && (
        <>
          <div className="scan-workspace">
            <div className="scan-feed">
              <div ref={gridRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <CameraGrid
                  cameras={cameras}
                  error={cameraError}
                  activeDeviceId={activeDeviceId}
                  onSelect={setActiveDeviceId}
                  onCapture={captureFromTile}
                  onActiveTracking={handleActiveTracking}
                  onActiveData={handleActiveData}
                  onRetry={refreshCameras}
                />
              </div>
              {cameras.length > 0 && !cameraError && (
                <CaptureButton trackingState={activeTracking} aiOnline={aiOnline} onCapture={captureActive} />
              )}
              {db.status === 'error' && (
                <p className="al-error" style={{ padding: '0 16px' }}>
                  Database offline — scan saving and history are disabled until it reconnects.
                </p>
              )}
            </div>
            <LivePanel
              deviceName={activeCam ? activeCam.label : null}
              trackingState={activeTracking}
              objects={activeObjects}
              lastCapture={lastCapture}
              sessionScans={sessionScans}
              conveyorOn={conveyorOn}
              onToggleConveyor={() => setConveyorOn((v) => !v)}
              onOpenLibrary={openLibrary}
            />
          </div>
          <StatusBar
            db={db}
            ai={ai}
            engine={engine}
            viewer={viewer}
            onOpenArchive={openArchive}
            onStartEngine={start3d}
            onLibrary={goLibraryIndex}
            onLogout={logout}
          />
        </>
      )}

      {view === 'records' && (
        <>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className={historyMode === 'list' ? 'al-btn-gold' : 'al-btn-outline-stone'}
                onClick={() => setHistoryMode('list')}
              >
                List
              </button>
              <button
                type="button"
                className={historyMode === 'grid' ? 'al-btn-gold' : 'al-btn-outline-stone'}
                onClick={() => {
                  setHistoryMode('grid');
                  setHistoryKey((k) => k + 1);
                }}
              >
                Grid
              </button>
            </div>
            {historyMode === 'list' ? (
              <HistoryList
                onSessionExpired={handleSessionExpired}
                refreshKey={historyKey}
                onOpenLibrary={openLibrary}
              />
            ) : (
              <HistoryGrid scans={gridScans} onOpen={openLibrary} />
            )}
          </div>
          <StatusPanel db={db} ai={ai} viewer={viewer} onOpenArchive={openArchive} />
        </>
      )}

      {view === 'library' && !libraryScan && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="history-heading" style={{ marginTop: 24 }}>
            Library
          </h2>
          <p className="al-meta">Select an artifact to open its profile.</p>
          <HistoryGrid scans={libraryScans} onOpen={openLibrary} />
          <StatusPanel db={db} ai={ai} viewer={viewer} onOpenArchive={openArchive} />
        </div>
      )}

      {view === 'admin' && isOwner && (
        <>
          <AdminView onSessionExpired={handleSessionExpired} />
          <StatusPanel db={db} ai={ai} viewer={viewer} onOpenArchive={openArchive} />
        </>
      )}
      {view === 'admin' && !isOwner && <p className="al-error">Access denied.</p>}

      {capture && !identification && (
        <ConfirmCapture
          capture={capture}
          aiOnline={aiOnline}
          autoStart={autoIdentify}
          onCancel={(expired) => {
            setCapture(null);
            setAutoIdentify(false);
            if (expired) handleSessionExpired('Session expired. Please log in again.');
          }}
          onIdentified={(result) => {
            setIdentification({ ...result, imageDataUrl: capture ? capture.thumbDataUrl : null });
            setSavedScan(null);
          }}
        />
      )}

      {identification && (
        <RecordCard
          identification={identification}
          savedId={savedScan ? savedScan.id : null}
          cameraSource={capture ? capture.cameraSource : null}
          engineOnline={engineOnline}
          onOpen3D={(scanId) => {
            const s = savedScan && savedScan.id === scanId ? savedScan : null;
            setAnglesFor({
              id: scanId,
              identification: (s && s.identification) || (identification && identification.identification),
              imageData: (s && (s.imageData || s.imageDataUrl)) || (identification && identification.imageDataUrl) || null,
            });
          }}
          onSaved={(scan) => {
            setSavedScan(scan);
            setLastCapture(scan);
            setSessionScans((n) => n + 1);
            setHistoryKey((k) => k + 1);
          }}
          onClose={(saved) => {
            setIdentification(null);
            setCapture(null);
            setAutoIdentify(false);
            if (saved) setHistoryKey((k) => k + 1);
          }}
        />
      )}

      {anglesFor && (
        <MultiAngleCapture
          scanId={anglesFor.id}
          engineOnline={engineOnline}
          engineLabel={engine.label}
          onRefreshEngine={refresh}
          fallbackImage={anglesFor.imageData || null}
          onCaptureFrame={captureFrame}
          onClose={(expired) => {
            setAnglesFor(null);
            if (expired) handleSessionExpired('Session expired. Please log in again.');
          }}
          onGenerated={(result) => {
            setAnglesFor(null);
            showToast('3D model generated');
            if (libraryScanId) openLibrary(libraryScanId);
            else if (savedScan) {
              api
                .getScan(savedScan.id)
                .then((s) => {
                  setSavedScan(s);
                  setLastCapture(s);
                })
                .catch(() => {});
            }
            setHistoryKey((k) => k + 1);
            void result;
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
