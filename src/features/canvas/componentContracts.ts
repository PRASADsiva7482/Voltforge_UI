/**
 * Component property contracts shared by the canvas and simulator.
 *
 * Potentiometer position is stored canonically as 0..1. Older projects may
 * contain the former 0..100 representation, so reads accept both formats.
 */
export function normalizePotentiometerPosition(value: unknown, fallback = 0.5): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

export function potentiometerPositionPercent(value: unknown, fallback = 0.5): number {
  return normalizePotentiometerPosition(value, fallback) * 100;
}
