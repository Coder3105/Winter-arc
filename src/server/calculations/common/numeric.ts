import { finite, positive } from "./validation";

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, finite(value)));
}

export function ratioPercent(numerator: number, denominator: number): number {
  return finite((finite(numerator) / positive(denominator, "denominator")) * 100);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  // Dividing each term first avoids overflow of an otherwise representable mean.
  return finite(values.reduce((sum, value) => sum + finite(value) / values.length, 0));
}
