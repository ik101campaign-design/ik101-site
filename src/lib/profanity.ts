// Minimal blocklist for v1. Implementer: expand with an English + Urdu/Roman-Urdu
// list before launch; keep entries lowercase, no regex metachars.
export const BLOCKLIST: string[] = ['badword', 'slur'];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsProfanity(text: string, list: string[] = BLOCKLIST): boolean {
  if (!text) return false;
  return list.some((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(text));
}
