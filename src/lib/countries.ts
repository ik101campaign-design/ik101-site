import { COUNTRY_CENTROIDS } from './countries-data';

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidCountryCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(COUNTRY_CENTROIDS, code);
}

export function countryCentroid(code: string): LatLng | null {
  const c = COUNTRY_CENTROIDS[code];
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export function jitter(point: LatLng, radiusDeg = 3, rand: () => number = Math.random): LatLng {
  const angle = rand() * Math.PI * 2;
  const dist = rand() * radiusDeg;
  return { lat: point.lat + Math.sin(angle) * dist, lng: point.lng + Math.cos(angle) * dist };
}

export function dotForCountry(code: string, rand: () => number = Math.random): LatLng | null {
  const c = countryCentroid(code);
  return c ? jitter(c, 3, rand) : null;
}
