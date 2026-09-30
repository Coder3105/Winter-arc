import { finite, positive } from "../common/validation";

export function calculateWaistHipRatio({
  waistCm,
  hipCm,
}: {
  waistCm: number;
  hipCm: number;
}): number {
  return finite(positive(waistCm, "waistCm") / positive(hipCm, "hipCm"));
}
