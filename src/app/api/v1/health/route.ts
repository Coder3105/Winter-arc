import { successResponse } from "@/lib/validation/api-response";
import { AppError } from "@/server/errors/app-error";
import { handleApiError } from "@/server/errors/api-error-handler";
import {
  getHealthData,
  type Clock,
  type DatabaseHealthCheck,
} from "@/server/services/health-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthHandlerDependencies {
  readonly checkDatabase?: DatabaseHealthCheck;
  readonly now?: Clock;
}

export function createHealthHandler(dependencies: HealthHandlerDependencies = {}) {
  return async function healthHandler() {
    try {
      const data = await getHealthData(dependencies.checkDatabase, dependencies.now);
      return successResponse(data);
    } catch {
      return handleApiError(new AppError("DATABASE_UNAVAILABLE"));
    }
  };
}

export const GET = createHealthHandler();
