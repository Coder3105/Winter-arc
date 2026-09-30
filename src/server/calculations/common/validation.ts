export class CalculationError extends Error {
  readonly code = "INVALID_CALCULATION_INPUT";

  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "CalculationError";
  }
}

export function finite(value: number, field = "result"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CalculationError(field, "must be a finite number.");
  }
  return value;
}

export function nonnegative(value: number, field: string): number {
  finite(value, field);
  if (value < 0) throw new CalculationError(field, "must be nonnegative.");
  return value;
}

export function positive(value: number, field: string): number {
  finite(value, field);
  if (value <= 0) throw new CalculationError(field, "must be positive.");
  return value;
}

export function integer(value: number, field: string, minimum = 0): number {
  finite(value, field);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new CalculationError(field, `must be a safe integer >= ${minimum}.`);
  }
  return value;
}

export function percentage(value: number, field: string): number {
  nonnegative(value, field);
  if (value > 100) throw new CalculationError(field, "must be <= 100.");
  return value;
}
