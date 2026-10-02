import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { BeruLoader } from "@/components/system/beru-loader";
import { ShadowGuard } from "@/components/system/shadow-portrait";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("shadow interface", () => {
  it("keeps all destinations and the only Exit control inside the initially closed drawer", () => {
    const html = renderToStaticMarkup(
      createElement(AuthenticatedHeader, {
        displayName: "Player",
        section: "TODAY",
        active: "TODAY",
      }),
    );
    expect(html).toContain('aria-label="Open System menu"');
    expect(html).toContain('aria-expanded="false"');
    const dialog = html.match(/<dialog[\s\S]*?<\/dialog>/)?.[0] ?? "";
    expect(dialog).not.toMatch(/<dialog[^>]*\sopen(?:=|\s|>)/);
    for (const href of [
      "/today",
      "/calendar",
      "/workouts",
      "/progress",
      "/reports",
      "/profile",
      "/status",
      "/achievements",
      "/rewards",
      "/settings",
    ])
      expect(dialog).toContain(`href="${href}"`);
    expect(dialog).not.toContain('href="/setup"');
    expect(dialog).toContain("CLOSE SESSION");
    expect(html.replace(dialog, "")).not.toContain("CLOSE SESSION");
    expect(html).not.toContain("LOG OUT");
  });
  it("announces loading without presenting invented progress", () => {
    const html = renderToStaticMarkup(
      createElement(BeruLoader, { message: "Loading quests" }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading quests");
    expect(html).toContain("beru.png");
    expect(html).not.toContain('role="progressbar"');
  });
  it("renders decorative companions without adding earned ranks", () => {
    const html = renderToStaticMarkup(createElement(ShadowGuard, { name: "Player" }));
    expect(html).toContain("SHADOW GUARD // BERU");
    expect(html).toContain("IGRIS");
    expect(html).toContain("IRON");
    expect(html).not.toContain("UNLOCKED");
  });
});
