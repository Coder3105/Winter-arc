import mongoose from "mongoose";

import { ownerBootstrapSchema } from "../src/lib/validation/auth";
import { bootstrapOwner } from "../src/server/services/owner-bootstrap-service";

async function main() {
  const environment = ownerBootstrapSchema.safeParse({
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    OWNER_PASSWORD: process.env.OWNER_PASSWORD,
    OWNER_DISPLAY_NAME: process.env.OWNER_DISPLAY_NAME,
  });

  if (!environment.success) {
    throw new Error(
      "Owner bootstrap configuration is incomplete. Set OWNER_EMAIL, OWNER_PASSWORD (12+ characters), and OWNER_DISPLAY_NAME.",
    );
  }

  const result = await bootstrapOwner(environment.data);
  console.log(
    result.ownerCreated ? "Owner account created." : "Owner account already exists.",
  );
  console.log(
    result.baselineCreated
      ? "InBody baseline created."
      : "InBody baseline already exists; no historical record was overwritten.",
  );
}

main()
  .catch(() => {
    console.error(
      "Original-owner bootstrap failed. Check configuration, migration status and database access. No raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
