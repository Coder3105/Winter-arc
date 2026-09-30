import "server-only";

import { getCurrentOwner } from "./request-auth";

export async function getApiOwner() {
  return getCurrentOwner();
}
