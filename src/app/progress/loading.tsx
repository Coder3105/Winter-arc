import { SystemLoading } from "@/components/system/system-loading";

export default function ProgressLoading() {
  return (
    <SystemLoading
      eyebrow="SYSTEM // TRANSFORMATION DATA"
      title="TRANSFORMATION STATUS"
      message="LOADING TRANSFORMATION DATA…"
    />
  );
}
