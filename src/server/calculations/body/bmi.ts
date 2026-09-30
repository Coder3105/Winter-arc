import { finite, positive } from "../common/validation";

export function calculateBmi(weightKg: number, heightCm: number): number {
  positive(weightKg, "weightKg");
  positive(heightCm, "heightCm");
  const heightSquaredM = positive(finite((heightCm / 100) ** 2), "heightSquaredM");
  return positive(finite(weightKg / heightSquaredM), "bmi");
}
