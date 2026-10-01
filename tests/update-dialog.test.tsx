import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateDialog } from "@/components/pwa/update-dialog";

describe("System update modal", () => {
  it("renders a labeled native modal with deliberate update and defer actions", () => {
    const html = renderToStaticMarkup(
      <UpdateDialog offline={false} onUpdate={() => {}} onLater={() => {}} />,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("SYSTEM UPDATE AVAILABLE");
    expect(html).toContain("UPDATE NOW");
    expect(html).toContain("LATER");
    expect(html).toContain("unfinished entries");
    expect(html).not.toContain("UPDATING SYSTEM");
  });
  it("disables installation offline but leaves a usable way back", () => {
    const html = renderToStaticMarkup(
      <UpdateDialog offline onUpdate={() => {}} onLater={() => {}} />,
    );
    expect(html).toContain("Reconnect to install");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>UPDATE NOW<\/button>/);
    const later = html.match(/<button[^>]*>LATER<\/button>/)?.[0];
    expect(later).toBeDefined();
    expect(later).not.toContain("disabled");
    expect(later).toContain("data-offline-allowed");
  });
});
