import ThreeGlobe from 'three-globe';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import type { Dot } from '../../lib/voices';
import { dotColor, shouldAnimate } from './globe-style';

export { dotColor, shouldAnimate } from './globe-style';

export interface GlobeHandle {
  setDots(dots: Dot[], newestId?: string): void;
  destroy(): void;
}

export function createGlobe(container: HTMLElement, onDotClick: (d: Dot) => void): GlobeHandle {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const size = container.clientWidth || 480;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // cap DPR for perf
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  // Overlay that holds the HTML dots (round, styleable, clickable). Pointer-events
  // pass through to the canvas except on the dots themselves.
  const dotLayer = document.createElement('div');
  dotLayer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
  container.appendChild(dotLayer);

  const land = feature(worldTopo as any, (worldTopo as any).objects.countries) as any;

  const globe = new ThreeGlobe()
    .showGlobe(true)
    .globeMaterial(new THREE.MeshBasicMaterial({ color: 0xe0f1e4, transparent: true, opacity: 0.95 }))
    .showAtmosphere(false)
    .polygonsData(land.features)
    .polygonCapColor(() => 'rgba(0,0,0,0)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(42,58,50,0.72)')
    .polygonAltitude(0.006); // coastline/border wireframe on the filled sphere

  const scene = new THREE.Scene();
  scene.add(globe, new THREE.AmbientLight(0xffffff, 1));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.z = 265; // pulled back enough that the whole globe + rim fit in frame (~88% fill)

  // Crisp rim tracing the sphere's silhouette (tangent circle), fixed facing the camera.
  const GLOBE_RADIUS = 100;
  const limbRadius = GLOBE_RADIUS * Math.sqrt(1 - (GLOBE_RADIUS / camera.position.z) ** 2);
  const limbZ = (GLOBE_RADIUS * GLOBE_RADIUS) / camera.position.z;
  const limbPts = new THREE.EllipseCurve(0, 0, limbRadius, limbRadius, 0, Math.PI * 2, false, 0)
    .getPoints(160)
    .map((p) => new THREE.Vector3(p.x, p.y, limbZ));
  const limb = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(limbPts),
    new THREE.LineBasicMaterial({ color: 0x223028, transparent: true, opacity: 0.95 }),
  );
  scene.add(limb);

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(container);
  const onVis = () => { /* read in loop */ };
  document.addEventListener('visibilitychange', onVis);

  // Drag-to-spin state
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastInteraction = 0;

  const el = renderer.domElement;
  el.style.cursor = 'grab';
  el.style.touchAction = 'none';

  const onPointerDown = (ev: PointerEvent) => {
    dragging = true;
    lastPointerX = ev.clientX;
    lastPointerY = ev.clientY;
    el.style.cursor = 'grabbing';
    el.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    const dx = ev.clientX - lastPointerX;
    const dy = ev.clientY - lastPointerY;
    lastPointerX = ev.clientX;
    lastPointerY = ev.clientY;
    globe.rotation.y += dx * 0.005;
    globe.rotation.x = Math.max(-1, Math.min(1, globe.rotation.x + dy * 0.005));
  };
  const onPointerEnd = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    lastInteraction = Date.now();
    el.style.cursor = 'grab';
    el.releasePointerCapture(ev.pointerId);
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerEnd);
  el.addEventListener('pointerleave', onPointerEnd);
  el.addEventListener('pointercancel', onPointerEnd);

  // HTML dots
  const dotEls = new Map<string, HTMLButtonElement>();
  let currentDots: Dot[] = [];
  const tmpV = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  function updateDots() {
    globe.updateMatrixWorld();
    const w = el.clientWidth || size;
    const h = el.clientHeight || size;
    for (const dot of currentDots) {
      const node = dotEls.get(dot.id);
      if (!node) continue;
      const c = globe.getCoords(dot.lat, dot.lng, 0.02);
      tmpV.set(c.x, c.y, c.z).applyMatrix4(globe.matrixWorld);
      toCam.copy(camera.position).sub(tmpV);
      // a dot is on the near hemisphere (visible) when its outward normal points toward the camera
      if (tmpV.dot(toCam) <= 0) { node.style.display = 'none'; continue; }
      const p = tmpV.clone().project(camera);
      node.style.display = '';
      node.style.left = ((p.x + 1) / 2) * w + 'px';
      node.style.top = ((1 - p.y) / 2) * h + 'px';
    }
  }

  let raf = 0;
  const loop = () => {
    const autoRotate =
      shouldAnimate({ reducedMotion, visible: visible && !document.hidden }) &&
      !dragging &&
      Date.now() - lastInteraction > 3000;
    if (autoRotate) globe.rotation.y += 0.0015;
    renderer.render(scene, camera);
    updateDots();
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    setDots(dots: Dot[], newestId?: string) {
      currentDots = dots;
      const present = new Set<string>();
      for (const dot of dots) {
        present.add(dot.id);
        let node = dotEls.get(dot.id);
        if (!node) {
          node = document.createElement('button');
          node.type = 'button';
          node.className = 'globe-dot';
          node.setAttribute('aria-label', 'View this voice');
          node.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const d = (node as any).__dot as Dot | undefined;
            if (d) onDotClick(d);
          });
          dotLayer.appendChild(node);
          dotEls.set(dot.id, node);
        }
        (node as any).__dot = dot;
        node.classList.toggle('is-newest', dot.id === newestId);
      }
      for (const [id, node] of dotEls) {
        if (!present.has(id)) { node.remove(); dotEls.delete(id); }
      }
      updateDots();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointerleave', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      dotEls.clear();
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
