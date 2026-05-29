import { dotForCountry } from './countries';

export interface Dot {
  id: string; lat: number; lng: number;
  message: string; name: string | null; country: string; pending: boolean;
}
export interface MessageRow {
  id: string; message: string; display_name: string | null; country_code: string;
}

export const CACHE_KEY = 'ik101.voices.v1';
export const OPTIMISTIC_KEY = 'ik101.voices.optimistic.v1';

export function rowToDot(row: MessageRow, pending: boolean, rand = Math.random): Dot | null {
  const p = dotForCountry(row.country_code, rand);
  if (!p) return null;
  return { id: row.id, lat: p.lat, lng: p.lng, message: row.message, name: row.display_name, country: row.country_code, pending };
}

export function mergeDots(approved: Dot[], optimistic: Dot[]): Dot[] {
  const byId = new Map<string, Dot>();
  for (const d of approved) byId.set(d.id, d);
  for (const d of optimistic) byId.set(d.id, d); // optimistic overrides
  return [...byId.values()];
}

export function readCache(storage: Storage = localStorage): Dot[] {
  try { return JSON.parse(storage.getItem(CACHE_KEY) ?? '[]') as Dot[]; }
  catch { return []; }
}
export function writeCache(dots: Dot[], storage: Storage = localStorage): void {
  storage.setItem(CACHE_KEY, JSON.stringify(dots));
}
export function readOptimistic(storage: Storage = localStorage): Dot[] {
  try { return JSON.parse(storage.getItem(OPTIMISTIC_KEY) ?? '[]') as Dot[]; }
  catch { return []; }
}
export function addOptimistic(dot: Dot, storage: Storage = localStorage): void {
  const cur = readOptimistic(storage);
  cur.push(dot);
  storage.setItem(OPTIMISTIC_KEY, JSON.stringify(cur));
}
