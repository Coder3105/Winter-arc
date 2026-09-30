import {
  DISPLAY_PRECISION,
  roundForDisplay,
  type CalculationSummary,
} from "@/server/calculations";

export function CalculatedMetrics({ summary }: { readonly summary: CalculationSummary }) {
  const { source, calculated } = summary;
  if (!source || !calculated)
    return <p className="empty-state">An assessment is needed to calculate metrics.</p>;
  const display = (value: number, decimals: number) =>
    roundForDisplay(value, decimals).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const katch = calculated.bmr.katchMcArdle;
  const mifflin = calculated.bmr.mifflinStJeor;
  return (
    <div className="baseline-summary">
      <p className="source-note">
        Based on the latest assessment: {source.provider} ·{" "}
        {source.assessmentDate.slice(0, 10)}
      </p>
      <dl className="metric-grid">
        <div>
          <dt>BMI // CALCULATED</dt>
          <dd>{display(calculated.bmi, DISPLAY_PRECISION.bmi)}</dd>
        </div>
        <div>
          <dt>BODY FAT MASS // DERIVED</dt>
          <dd>
            {display(calculated.bodyFatMassDerivedKg, DISPLAY_PRECISION.weightKg)} kg
          </dd>
        </div>
        <div>
          <dt>FAT-FREE MASS // CALCULATED</dt>
          <dd>
            {display(calculated.fatFreeMassDerivedKg, DISPLAY_PRECISION.weightKg)} kg
          </dd>
        </div>
        <div>
          <dt>BMR // REPORTED BY {source.provider.toUpperCase()}</dt>
          <dd>{display(source.bmrReported, DISPLAY_PRECISION.bmrKcal)} kcal/day</dd>
        </div>
        <div>
          <dt>KATCH-MCARDLE // ESTIMATE</dt>
          <dd>
            {katch
              ? `${display(katch.value, DISPLAY_PRECISION.bmrKcal)} kcal/day`
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>MIFFLIN-ST JEOR // ESTIMATE</dt>
          <dd>
            {mifflin
              ? `${display(mifflin.value, DISPLAY_PRECISION.bmrKcal)} kcal/day`
              : "Unavailable"}
          </dd>
        </div>
      </dl>
      <p className="source-note">
        Reported body fat mass: {source.bodyFatMassKg} kg. Derived values do not replace
        the assessment. Fat-free mass above uses reported fat mass.
      </p>
      <p className="source-note">
        BMR equations provide estimates and can differ from device-reported values. These
        are not calorie targets.
      </p>
      <p className="source-note">
        {mifflin
          ? `Mifflin-St Jeor uses your configured age at baseline (${summary.inputs.mifflin?.ageYears} years) and sex coefficient.`
          : "Mifflin-St Jeor requires a completed profile with a supported sex coefficient."}
      </p>
    </div>
  );
}
