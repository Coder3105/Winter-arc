import { ShadowPortrait } from "./shadow-portrait";

export function BeruLoader({
  message = "Preparing your System…",
  compact = false,
}: {
  readonly message?: string;
  readonly compact?: boolean;
}) {
  return (
    <div
      className={`beru-loader${compact ? " beru-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="beru-loader__summon" aria-hidden="true">
        <span className="beru-loader__ring" />
        <span className="beru-loader__ring beru-loader__ring--inner" />
        <ShadowPortrait soldier="beru" size={compact ? 52 : 192} eager />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="beru-loader__copy">
        <strong>{compact ? "SYSTEM // EXITING" : "ARISE"}</strong>
        <p>{message}</p>
        <span className="beru-loader__signal" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
