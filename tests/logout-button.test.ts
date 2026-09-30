import { isValidElement, useState, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/auth/logout-button";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: vi.fn(),
}));
let states: unknown[];
let cursor: number;
function render() {
  cursor = 0;
  return LogoutButton();
}
function button(
  node: ReactNode,
): { onClick: () => Promise<void>; disabled: boolean } | undefined {
  if (Array.isArray(node)) return node.map(button).find(Boolean);
  if (
    !isValidElement<{
      children?: ReactNode;
      onClick: () => Promise<void>;
      disabled: boolean;
    }>(node)
  )
    return;
  return node.type === "button" ? node.props : button(node.props.children);
}
describe("Exit session", () => {
  beforeEach(() => {
    states = [];
    cursor = 0;
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(useState).mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (index >= states.length) states.push(initial);
      return [
        states[index],
        (value: unknown) => {
          states[index] = value;
        },
      ];
    }) as typeof useState);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("shows pending feedback and disables Exit while revoking the session", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = button(render())!.onClick();
    expect(button(render())!.disabled).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    finish(new Response(null, { status: 200 }));
    await pending;
    expect(fetch).toHaveBeenCalledWith("/api/v1/auth/logout", { method: "POST" });
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
  it("keeps the user in the app with a retryable error when logout fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await button(render())!.onClick();
    expect(router.replace).not.toHaveBeenCalled();
    expect(states[1]).toContain("Could not close your session");
    expect(button(render())!.disabled).toBe(false);
  });
});
