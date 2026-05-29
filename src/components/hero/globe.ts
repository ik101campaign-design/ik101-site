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
  const size = Math.min(container.clientWidth, 640);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // cap DPR for perf
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const land = feature(worldTopo as any, (worldTopo as any).objects.countries) as any;

  const globe = new ThreeGlobe()
    .showGlobe(false)
    .showAtmosphere(false)
    .polygonsData(land.features)
    .polygonCapColor(() => 'rgba(0,0,0,0)')
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(90,107,98,0.6)')
    .polygonAltitude(0.006); // faint coastline/border wireframe (Nutopia look)

  const scene = new THREE.Scene();
  scene.add(globe, new THREE.AmbientLight(0xffffff, 1));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.z = 200;

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

  let raf = 0;
  const loop = () => {
    const autoRotate =
      shouldAnimate({ reducedMotion, visible: visible && !document.hidden }) &&
      !dragging &&
      Date.now() - lastInteraction > 3000;
    if (autoRotate) {
      globe.rotation.y += 0.0015;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();

  renderer.domElement.addEventListener('click', (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(globe.children, true).find((h) => (h.object as any).__dot);
    if (hit) onDotClick((hit.object as any).__dot as Dot);
  });

  return {
    setDots(dots: Dot[], newestId?: string) {
      globe.pointsData(dots)
        .pointLat('lat').pointLng('lng')
        .pointAltitude(0.02)
        .pointsMerge(false);
      // pointThreeObject is a valid three-globe accessor absent from the bundled .d.ts
      (globe as any).pointThreeObject((d: any) => {
        const color = dotColor({ pending: d.pending, isNewest: d.id === newestId });
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 12, 12),
          new THREE.MeshBasicMaterial({ color }),
        );
        (mesh as any).__dot = d;
        return mesh;
      });
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
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
