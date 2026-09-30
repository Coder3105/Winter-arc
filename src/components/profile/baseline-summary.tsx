interface BaselineSummaryProps {
  readonly baseline: {
    source: string;
    assessmentDate: string;
    measurements: {
      weightKg: number;
      percentBodyFat: number;
      skeletalMuscleMassKg: number;
      bmiReported: number;
      basalMetabolicRateKcalReported: number;
      visceralFatLevel: number;
      targetWeightKgReported: number;
    };
  } | null;
}

export function BaselineSummary({ baseline }: BaselineSummaryProps) {
  if (!baseline) {
    return <p className="empty-state">BASELINE NOT YET SEEDED</p>;
  }

  const values = baseline.measurements;
  return (
    <div className="baseline-summary">
      <div className="baseline-summary__source">
        <span>{baseline.source}</span>
        <span>14 AUG 2026 // 19:11</span>
      </div>
      <dl className="metric-grid">
        <div>
          <dt>WEIGHT</dt>
          <dd>{values.weightKg} kg</dd>
        </div>
        <div>
          <dt>BODY FAT</dt>
          <dd>{values.percentBodyFat}%</dd>
        </div>
        <div>
          <dt>SKELETAL MUSCLE</dt>
          <dd>{values.skeletalMuscleMassKg} kg</dd>
        </div>
        <div>
          <dt>VISCERAL FAT LEVEL</dt>
          <dd>{values.visceralFatLevel}</dd>
        </div>
        <div>
          <dt>BMI // REPORTED</dt>
          <dd>{values.bmiReported}</dd>
        </div>
        <div>
          <dt>BMR // REPORTED</dt>
          <dd>{values.basalMetabolicRateKcalReported} kcal</dd>
        </div>
      </dl>
      <p className="source-note">
        INBODY REFERENCE TARGET: {values.targetWeightKgReported} kg — SOURCE VALUE ONLY
      </p>
    </div>
  );
}
