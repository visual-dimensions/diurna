import type { Map as MapLibreMap } from 'maplibre-gl';
import type { City } from '../data/load';
import { lightsOff, lightsOn, lightsOnNow, showClusters } from './markers';

const SESSION_KEY = 'diurna:intro-seen';
const FLIGHT_MS = 2600;
const LIGHTS_STAGGER_MS = 1200;

/** Camera position "in space" the intro starts from. */
export const INTRO_START = { center: [62, 28] as [number, number], zoom: 1 };

export function introWanted(reducedMotion: boolean, hasDeepLink: boolean): boolean {
  if (reducedMotion || hasDeepLink) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode – the intro may simply play again */
  }
}

/**
 * Fly from space to the visitor's region while the newsrooms light up east → west.
 * Any pointer, wheel or key input skips straight to the end state.
 * Total < 3 s.
 */
export function playIntro(map: MapLibreMap, cities: City[], target: { center: [number, number]; zoom: number }) {
  markSeen();
  lightsOff(map, cities);
  showClusters(map, false); // the lights come on per city; clusters join at the end
  const canvas = map.getCanvasContainer();
  let finished = false;
  let stopLights = () => {};

  const cleanup = () => {
    showClusters(map, true);
    canvas.removeEventListener('pointerdown', skip);
    canvas.removeEventListener('wheel', skip);
    window.removeEventListener('keydown', skip);
  };
  const skip = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(lightsTimer);
    stopLights();
    map.stop();
    map.jumpTo(target);
    lightsOnNow(map, cities);
    cleanup();
  };

  map.flyTo({ ...target, duration: FLIGHT_MS, curve: 1.2, essential: true });
  // The lights start while the camera is still approaching.
  const lightsTimer = window.setTimeout(() => {
    stopLights = lightsOn(map, cities, LIGHTS_STAGGER_MS, () => {
      finished = true;
      cleanup();
    });
  }, FLIGHT_MS * 0.25);

  canvas.addEventListener('pointerdown', skip);
  canvas.addEventListener('wheel', skip, { passive: true });
  window.addEventListener('keydown', skip);
}
