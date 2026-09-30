import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/workout-service", () => ({
  createTodayWorkout: vi.fn(),
  deleteTodayWorkout: vi.fn(),
  getCurrentWorkoutDashboard: vi.fn(),
  getTodayWorkouts: vi.fn(),
  getWorkoutsByDate: vi.fn(),
}));

import { DELETE as deleteWorkout } from "@/app/api/v1/workouts/[id]/route";
import { GET as getToday } from "@/app/api/v1/workouts/today/route";
import { GET as getWeek } from "@/app/api/v1/workouts/week/route";
import { GET as getByDate, POST as postWorkout } from "@/app/api/v1/workouts/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  createTodayWorkout,
  deleteTodayWorkout,
  getCurrentWorkoutDashboard,
  getTodayWorkouts,
  getWorkoutsByDate,
} from "@/server/services/workout-service";

const owner = {
  id: "owner-1",
  email: "owner@example.test",
  displayName: "Owner",
};
const unavailable = { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" } as const;

describe("workout APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("protects create, today, week, date, and delete", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect(
      (await postWorkout(new Request("http://test", { method: "POST", body: "{}" })))
        .status,
    ).toBe(401);
    expect((await getToday()).status).toBe(401);
    expect((await getWeek()).status).toBe(401);
    expect(
      (await getByDate(new NextRequest("http://test/api/v1/workouts?date=2026-09-30")))
        .status,
    ).toBe(401);
    expect(
      (
        await deleteWorkout(new Request("http://test", { method: "DELETE" }), {
          params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
        })
      ).status,
    ).toBe(401);
  });

  it("validates and creates from the authenticated owner only", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(createTodayWorkout).mockResolvedValue({ id: "workout-1" } as never);
    vi.mocked(getCurrentWorkoutDashboard).mockResolvedValue(unavailable);
    const response = await postWorkout(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "STRENGTH",
          title: "Push Day",
          durationMinutes: 65,
          userId: "attacker",
          challengeWeek: 99,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createTodayWorkout).toHaveBeenCalledExactlyOnceWith("owner-1", {
      type: "STRENGTH",
      title: "Push Day",
      durationMinutes: 65,
      notes: null,
    });
  });

  it.each([
    { type: "UNKNOWN", durationMinutes: 60 },
    { type: "CARDIO", durationMinutes: 0 },
    { type: "CARDIO", durationMinutes: 1.5 },
    { type: "CARDIO", durationMinutes: 1_441 },
  ])("rejects invalid create %#", async (body) => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    const response = await postWorkout(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
    expect(createTodayWorkout).not.toHaveBeenCalled();
  });

  it("returns private today and week projections", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(getTodayWorkouts).mockResolvedValue(unavailable);
    vi.mocked(getCurrentWorkoutDashboard).mockResolvedValue(unavailable);
    const today = await getToday();
    const week = await getWeek();
    expect(today.status).toBe(200);
    expect(week.status).toBe(200);
    expect(today.headers.get("cache-control")).toBe("private, no-store");
    expect(week.headers.get("cache-control")).toBe("private, no-store");
    expect(getTodayWorkouts).toHaveBeenCalledWith("owner-1");
    expect(getCurrentWorkoutDashboard).toHaveBeenCalledWith("owner-1");
  });

  it("validates and owner-scopes historical reads", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    expect(
      (await getByDate(new NextRequest("http://test/api/v1/workouts?date=2026-02-30")))
        .status,
    ).toBe(400);
    vi.mocked(getWorkoutsByDate).mockResolvedValue({
      kind: "AVAILABLE",
      date: "2026-09-30",
      sessions: [],
    });
    const response = await getByDate(
      new NextRequest("http://test/api/v1/workouts?date=2026-09-30&userId=attacker"),
    );
    expect(response.status).toBe(200);
    expect(getWorkoutsByDate).toHaveBeenCalledExactlyOnceWith("owner-1", "2026-09-30");
  });

  it("validates and safely deletes by authenticated owner", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    expect(
      (
        await deleteWorkout(new Request("http://test", { method: "DELETE" }), {
          params: Promise.resolve({ id: "bad-id" }),
        })
      ).status,
    ).toBe(400);
    vi.mocked(deleteTodayWorkout).mockResolvedValue({ id: "deleted" } as never);
    vi.mocked(getCurrentWorkoutDashboard).mockResolvedValue(unavailable);
    const response = await deleteWorkout(
      new Request("http://test", { method: "DELETE" }),
      { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) },
    );
    expect(response.status).toBe(200);
    expect(deleteTodayWorkout).toHaveBeenCalledExactlyOnceWith(
      "owner-1",
      "507f1f77bcf86cd799439011",
    );
  });
});
