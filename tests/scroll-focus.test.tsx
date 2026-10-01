import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollFocus } from "@/components/system/scroll-focus";
import { selectFocusCard } from "@/lib/ui/scroll-focus";

describe("dashboard scroll focus", () => {
  it("selects one card at the reading line as the viewport advances", () => {
    const cards = [
      { top: 100, bottom: 300 },
      { top: 340, bottom: 540 },
      { top: 580, bottom: 780 },
    ];
    expect(selectFocusCard(cards, 0, 500)).toBe(0);
    expect(selectFocusCard(cards, 220, 500)).toBe(1);
    expect(selectFocusCard(cards, 460, 500)).toBe(2);
  });
  it("keeps a tall card active through its contents", () => {
    expect(
      selectFocusCard(
        [
          { top: -400, bottom: 800 },
          { top: 830, bottom: 1100 },
        ],
        0,
        600,
      ),
    ).toBe(0);
  });
  it("retains the current card on an exact gap tie and handles empty lists", () => {
    const cards = [
      { top: 0, bottom: 200 },
      { top: 260, bottom: 400 },
    ];
    expect(selectFocusCard(cards, 0, 500, 1)).toBe(1);
    expect(selectFocusCard(cards, 0, 500, 0)).toBe(0);
    expect(selectFocusCard([], 0, 500)).toBe(-1);
    expect(selectFocusCard(cards, 0, 0)).toBe(-1);
  });
  it("renders readable server HTML with a view toggle, without hiding controls", () => {
    const html = renderToStaticMarkup(
      <ScrollFocus>
        <input name="weight" />
      </ScrollFocus>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("FOCUS VIEW ON");
    expect(html).toContain('name="weight"');
    expect(html).not.toMatch(/data-focus-ready|aria-hidden|inert|disabled/);
  });
});
