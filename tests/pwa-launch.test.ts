import fs from "node:fs";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Loading from "@/app/loading";

describe("Winter Arc branded PWA startup", () => {
  it("renders the same accessible indeterminate feedback in both startup shells", () => {
    const shells = [
      fs.readFileSync("public/launch.html", "utf8"),
      renderToStaticMarkup(createElement(Loading)),
    ];
    for (const html of shells) {
      expect(html).toContain("SYSTEM LOADING");
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-label="Loading the System"');
      expect(html).toContain('role="status"');
      expect(html).toContain("/icons/system-mark.svg");
      expect(html).not.toMatch(/aria-valuenow|\d+%/);
    }
    expect(shells[0]).toContain('href="/"');
    expect(shells[0]).toContain("<noscript>");
  });

  it.each([
    [true, "/"],
    [false, "/offline.html"],
  ])("hands off after a paint opportunity (online: %s)", (online, destination) => {
    const frames: (() => void)[] = [];
    const replace = vi.fn();
    vm.runInNewContext(fs.readFileSync("public/launch.js", "utf8"), {
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      window: { location: { replace } },
      navigator: { onLine: online },
    });
    expect(replace).not.toHaveBeenCalled();
    frames.shift()!();
    expect(replace).not.toHaveBeenCalled();
    frames.shift()!();
    expect(replace).toHaveBeenCalledExactlyOnceWith(destination);
    expect(frames).toHaveLength(0);
  });

  it("has self-contained motion styles with an accessible reduced-motion fallback", () => {
    const css = fs.readFileSync("public/system-boot.css", "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("system-boot-sweep");
    expect(css).toContain("system-boot-mark");
    expect(css).not.toMatch(/url\(|@import/);
  });

  it("does not manufacture splash duration with timers", () => {
    const script = fs.readFileSync("public/launch.js", "utf8");
    expect(script).not.toMatch(/setTimeout|setInterval/);
    expect(script).toContain("requestAnimationFrame");
  });
});
