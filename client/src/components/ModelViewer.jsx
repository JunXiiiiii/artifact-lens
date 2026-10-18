import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';

function AperturePlaceholder({ onGenerate }) {
  return (
    <div className="model-empty">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true" opacity="0.4">
        <circle cx="12" cy="12" r="9" stroke="var(--terrain-stone)" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" stroke="var(--terrain-stone)" strokeWidth="1.5" />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="var(--terrain-stone)" strokeWidth="1.5" />
      </svg>
      <p className="al-meta">No 3D model — capture a photo to generate one</p>
      {onGenerate && (
        <button type="button" className="al-btn-ghost-teal" onClick={onGenerate}>
          Generate 3D Model
        </button>
      )}
    </div>
  );
}

export default function ModelViewer({ scanId, modelAvailable, caption, onGenerate, onSessionExpired }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState(modelAvailable ? 'loading' : 'empty');
  const [error, setError] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  autoRotateRef.current = autoRotate;
  const controlsRef = useRef({ reset: null, fit: null });

  useEffect(() => {
    if (!modelAvailable) {
      setStatus('empty');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      let objectUrl = null;
      let renderer = null;
      let raf = 0;
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        if (cancelled) return;

        objectUrl = await api.fetchModelBlob(scanId);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const mount = mountRef.current;
        if (!mount) return;
        const w = mount.clientWidth || 600;
        const h = mount.clientHeight || 480;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
        camera.position.set(2.4, 1.6, 3.2);

        // Warm key (gold) top-right, cool fill (teal) left, soft ambient.
        // (No particle systems: motion is reserved for state, per product law.)
        const key = new THREE.DirectionalLight(0xd9a441, 2.2);
        key.position.set(4, 6, 3);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x5fa69c, 1.1);
        fill.position.set(-5, 2, 1);
        scene.add(fill);
        const ambient = new THREE.AmbientLight(0xf1e9d8, 0.55);
        scene.add(ambient);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2; // gentle showcase spin
        controlsRef.current = {
          reset: () => {
            camera.position.set(2.4, 1.6, 3.2);
            controls.target.set(0, 0.5, 0);
          },
          fit: () => {
            camera.position.set(2.4, 1.6, 3.2);
            controls.target.set(0, 0.5, 0);
            camera.zoom = 1;
            camera.updateProjectionMatrix();
          },
        };

        // Hover brightness: raycast-free proximity — brighten while pointer is over canvas.
        const onEnter = () => {
          ambient.intensity = 0.85;
        };
        const onLeave = () => {
          ambient.intensity = 0.55;
        };
        renderer.domElement.addEventListener('pointerenter', onEnter);
        renderer.domElement.addEventListener('pointerleave', onLeave);

        const loader = new GLTFLoader();
        loader.load(
          objectUrl,
          (gltf) => {
            if (cancelled) return;
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 1.6 / maxDim;
            model.scale.setScalar(scale);
            model.position.sub(center.multiplyScalar(scale));
            model.position.y += 0.0;
            scene.add(model);
            setStatus('ready');
          },
          undefined,
          (err) => {
            if (cancelled) return;
            console.error('[model-viewer]', err);
            setError('Could not load the 3D model file. It may be corrupt — try generating again.');
            setStatus('error');
          }
        );

        const tick = () => {
          raf = requestAnimationFrame(tick);
          controls.autoRotate = autoRotateRef.current;
          controls.update();
          renderer.render(scene, camera);
        };
        tick();

        const onResize = () => {
          if (!mount) return;
          const nw = mount.clientWidth || 600;
          const nh = mount.clientHeight || 480;
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);

        cleanupRef.current = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
          renderer.domElement.removeEventListener('pointerenter', onEnter);
          renderer.domElement.removeEventListener('pointerleave', onLeave);
          controls.dispose();
          scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
            }
          });
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
      } catch (err) {
        if (cancelled) return;
        if (err && err.code === 'UNAUTHORIZED' && onSessionExpired) {
          onSessionExpired(err.message);
          return;
        }
        console.error('[model-viewer]', err);
        setError(err.message || '3D viewer failed to start.');
        setStatus('error');
      }
    })();

    const cleanupRef = { current: null };
    return () => {
      cancelled = true;
      if (cleanupRef.current) cleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, modelAvailable]);

  const toggleRotate = () => setAutoRotate((v) => !v);

  return (
    <div className="library-centre">
      {caption && (
        <div className="model-plate" aria-label="Specimen plate">
          <span className="model-plate-id">{caption.id}</span>
          <span className="model-plate-era">{caption.era}</span>
        </div>
      )}
      <div className="model-stage" ref={mountRef}>
        {status === 'empty' && <AperturePlaceholder onGenerate={onGenerate} />}
        {status === 'loading' && (
          <div className="model-empty" style={{ border: 'none' }}>
            <svg className="aperture-spinner" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path d="M20 4 A16 16 0 0 1 36 20" stroke="var(--accent-gold)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="rgba(140,133,120,0.3)" strokeWidth="1.5" />
            </svg>
            <div className="ai-phrase">Loading 3D model…</div>
          </div>
        )}
        {status === 'error' && (
          <div className="model-empty" style={{ border: 'none' }}>
            <p className="al-error">{error}</p>
          </div>
        )}
      </div>
      {status === 'ready' && (
        <div className="model-tools">
          <button
            type="button"
            className={`model-tool${autoRotate ? ' is-on' : ''}`}
            onClick={toggleRotate}
            aria-pressed={autoRotate}
          >
            Auto-rotate
          </button>
          <button
            type="button"
            className="model-tool"
            onClick={() => controlsRef.current.reset && controlsRef.current.reset()}
          >
            Reset view
          </button>
          <button
            type="button"
            className="model-tool"
            onClick={() => controlsRef.current.fit && controlsRef.current.fit()}
          >
            Zoom fit
          </button>
        </div>
      )}
    </div>
  );
}
