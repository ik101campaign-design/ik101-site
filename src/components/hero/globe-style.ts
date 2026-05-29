export function dotColor(d: { pending: boolean; isNewest: boolean }): string {
  return d.pending || d.isNewest ? '#00bf63' : '#8a978f';
}

export function shouldAnimate(s: { reducedMotion: boolean; visible: boolean }): boolean {
  return !s.reducedMotion && s.visible;
}
