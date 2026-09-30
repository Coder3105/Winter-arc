import { SystemLoading } from "@/components/system/system-loading";

export default function TodayLoading() {
  return (
    <SystemLoading
      eyebrow="SYSTEM // TODAY"
      title="DAILY QUEST"
      message="LOADING CURRENT PROTOCOL DAY…"
    />
  );
}
