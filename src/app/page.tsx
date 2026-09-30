import { redirect } from "next/navigation";

import { requirePageOwner } from "@/server/auth/request-auth";
import { getSetupState } from "@/server/services/setup-service";

export default async function HomePage() {
  const owner = await requirePageOwner();
  const setup = await getSetupState(owner.id);
  if (!setup.complete) {
    redirect("/setup");
  }
  redirect("/today");
}
