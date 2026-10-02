import "server-only";

import type { z } from "zod";

import type { ownerBootstrapSchema } from "@/lib/validation/auth";
import { connectToDatabase } from "@/server/db/mongoose";
import { hashPassword } from "@/server/auth/password";
import { BodyCompositionAssessmentModel } from "@/server/models/body-composition-assessment";
import { OwnerModel } from "@/server/models/owner";
import { INBODY_BASELINE } from "@/server/seed/inbody-baseline";
import { normalizeEmail } from "@/lib/auth/email";

type BootstrapInput = z.infer<typeof ownerBootstrapSchema>;

export interface BootstrapResult {
  readonly ownerCreated: boolean;
  readonly baselineCreated: boolean;
  readonly ownerId: string;
}

export async function bootstrapOwner(input: BootstrapInput): Promise<BootstrapResult> {
  await connectToDatabase();
  const normalizedEmail = normalizeEmail(input.OWNER_EMAIL);
  let owner = await OwnerModel.findOne({ email: normalizedEmail });
  let ownerCreated = false;

  if (!owner) {
    const anotherOwner = await OwnerModel.exists({});
    if (anotherOwner) {
      throw new Error("An owner already exists; refusing to create a second owner.");
    }

    // Empty-database legacy bootstrap only; never build indexes over unknown accounts.
    await OwnerModel.createIndexes();

    owner = await OwnerModel.create({
      email: normalizedEmail,
      emailNormalized: normalizedEmail,
      status: "ACTIVE",
      emailVerifiedAt: null,
      isOriginalOwner: true,
      passwordHash: await hashPassword(input.OWNER_PASSWORD),
      displayName: input.OWNER_DISPLAY_NAME,
      isActive: true,
      lastLoginAt: null,
    });
    ownerCreated = true;
  }

  if (!owner.isOriginalOwner) {
    throw new Error(
      "Refusing to seed personal baseline data for a non-original account. Run the V2.1 migration first.",
    );
  }

  const assessmentDate = new Date(INBODY_BASELINE.assessmentDate);
  const existingBaseline = await BodyCompositionAssessmentModel.findOne({
    userId: owner._id,
    source: INBODY_BASELINE.source,
    assessmentDate,
  });
  let baselineCreated = false;

  if (!existingBaseline) {
    await BodyCompositionAssessmentModel.create({
      ...INBODY_BASELINE,
      userId: owner._id,
      winterArcConfigId: null,
      assessmentDate,
    });
    baselineCreated = true;
  }

  return {
    ownerCreated,
    baselineCreated,
    ownerId: owner._id.toString(),
  };
}
