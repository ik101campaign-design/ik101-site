import { mergeDots, CACHE_KEY, readCache, writeCache, type Dot } from '../../src/lib/voices';
import { test, expect } from 'vitest';

const mem: Record<string, string> = {};
const fakeStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v; },
} as unknown as Storage;

test('mergeDots dedupes by id, optimistic wins', () => {
  const approved: Dot[] = [{ id: 'a', lat: 1, lng: 2, message: 'hi', name: null, country: 'PK', pending: false }];
  const optimistic: Dot[] = [{ id: 'a', lat: 1, lng: 2, message: 'hi', name: null, country: 'PK', pending: true }];
  const merged = mergeDots(approved, optimistic);
  expect(merged).toHaveLength(1);
  expect(merged[0].pending).toBe(true);
});

test('cache round-trips dots', () => {
  const dots: Dot[] = [{ id: 'x', lat: 0, lng: 0, message: 'm', name: 'A', country: 'US', pending: false }];
  writeCache(dots, fakeStorage);
  expect(readCache(fakeStorage)).toEqual(dots);
  expect(mem[CACHE_KEY]).toBeDefined();
});

test('readCache returns [] on missing/corrupt data', () => {
  const empty = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  expect(readCache(empty)).toEqual([]);
  const bad = { getItem: () => '{not json', setItem: () => {} } as unknown as Storage;
  expect(readCache(bad)).toEqual([]);
});
