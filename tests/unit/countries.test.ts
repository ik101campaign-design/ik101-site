import { isValidCountryCode, countryCentroid, jitter, dotForCountry } from '../../src/lib/countries';

test('isValidCountryCode accepts known, rejects unknown', () => {
  expect(isValidCountryCode('PK')).toBe(true);
  expect(isValidCountryCode('ZZ')).toBe(false);
});

test('countryCentroid returns lat/lng for known code', () => {
  expect(countryCentroid('PK')).toEqual({ lat: 30.3753, lng: 69.3451 });
  expect(countryCentroid('ZZ')).toBeNull();
});

test('jitter stays within the given radius', () => {
  const base = { lat: 30, lng: 69 };
  const p = jitter(base, 3, () => 0.5);
  expect(Math.hypot(p.lat - base.lat, p.lng - base.lng)).toBeLessThanOrEqual(3 + 1e-9);
});

test('dotForCountry returns null for invalid code', () => {
  expect(dotForCountry('ZZ', () => 0.5)).toBeNull();
  expect(dotForCountry('PK', () => 0.5)).not.toBeNull();
});
