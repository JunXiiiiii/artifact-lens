export function motionAllowed() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
