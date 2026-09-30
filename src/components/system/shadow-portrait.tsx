import Image from "next/image";

export type ShadowSoldier = "beru" | "igris" | "iron";
export const SHADOW_SOLDIERS: readonly ShadowSoldier[] = ["beru", "igris", "iron"];

export function ShadowPortrait({
  soldier,
  size = 64,
  className = "",
  eager = false,
}: {
  readonly soldier: ShadowSoldier;
  readonly size?: number;
  readonly className?: string;
  readonly eager?: boolean;
}) {
  return (
    <span
      className={`shadow-portrait shadow-portrait--${soldier} ${className}`}
      aria-hidden="true"
    >
      <Image
        src={`/shadows/${soldier}.png`}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        loading={eager ? "eager" : "lazy"}
      />
    </span>
  );
}

export function ShadowGuard({ name }: { readonly name: string }) {
  return (
    <section className="shadow-guard" aria-label="Shadow guard">
      <ShadowPortrait soldier="beru" size={144} eager />
      <div className="shadow-guard__identity">
        <span>SHADOW GUARD // BERU</span>
        <h2>{name}</h2>
        <p>Your next chapter starts with today.</p>
      </div>
      <div className="shadow-guard__roster" aria-label="Shadow companions">
        <span>
          <ShadowPortrait soldier="igris" size={48} />
          <small>IGRIS</small>
        </span>
        <span>
          <ShadowPortrait soldier="iron" size={48} />
          <small>IRON</small>
        </span>
      </div>
    </section>
  );
}
