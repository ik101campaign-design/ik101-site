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

  let raf = 0;
  const loop = () => {
    if (shouldAnimate({ reducedMotion, visible: visible && !document.hidden })) {
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
        .pointAltitude(0.01)
        .pointRadius(0.4)
        .pointColor((d: any) => dotColor({ pending: d.pending, isNewest: d.id === newestId }));
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
