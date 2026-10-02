import { SystemLoading } from "@/components/system/system-loading";

export default function Loading() {
  return (
    <SystemLoading
      eyebrow="SYSTEM // NETWORK"
      title="GUILD"
      message="SYNCHRONIZING PRIVATE GUILD LINKS…"
    />
  );
}
