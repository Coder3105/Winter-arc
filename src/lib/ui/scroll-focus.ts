export interface FocusBounds {
  readonly top: number;
  readonly bottom: number;
}

/** Prefer the card crossing the reading line; retain the current card on ties. */
export function selectFocusCard(
  bounds: readonly FocusBounds[],
  viewportTop: number,
  viewportHeight: number,
  current = -1,
): number {
  if (!bounds.length || viewportHeight <= 0) return -1;
  const line = viewportTop + viewportHeight * 0.46;
  const distances = bounds.map(({ top, bottom }) =>
    Math.max(top - line, line - bottom, 0),
  );
  const closest = Math.min(...distances);
  return current >= 0 && distances[current] === closest
    ? current
    : distances.indexOf(closest);
}
