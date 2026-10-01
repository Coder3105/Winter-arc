"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { selectFocusCard } from "@/lib/ui/scroll-focus";

/** Presentation only: leaves every form mounted and never changes source state. */
export function ScrollFocus({ children }: { readonly children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const root = scope.current;
    if (!root || !enabled) return;
    let cards: HTMLElement[] = [];
    let active: HTMLElement | undefined;
    let interacted: HTMLElement | undefined;
    let frame = 0;
    const cardFor = (target: Node) =>
      cards.find(
        (card) =>
          card.contains(target) ||
          (target instanceof HTMLAnchorElement && target.contains(card)),
      );
    const activate = (next: HTMLElement | undefined) => {
      if (active === next) return;
      active?.removeAttribute("data-focus-active");
      active = next;
      active?.setAttribute("data-focus-active", "true");
    };
    const update = () => {
      frame = 0;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rects = cards.map((card) => card.getBoundingClientRect());
      const editing = document.activeElement;
      // Keep a visible field clear while typing, including with a mobile keyboard.
      if (
        editing instanceof HTMLElement &&
        editing.matches(
          "input, textarea, select, [contenteditable='true'], :focus-visible",
        )
      ) {
        const focusedCard = cardFor(editing);
        const index = focusedCard ? cards.indexOf(focusedCard) : -1;
        const rect = rects[index];
        if (
          rect &&
          rect.bottom > viewportTop &&
          rect.top < viewportTop + viewportHeight
        ) {
          activate(cards[index]);
          return;
        }
      }
      const interactionIndex = interacted ? cards.indexOf(interacted) : -1;
      const interactionRect = rects[interactionIndex];
      if (
        interactionRect &&
        interactionRect.bottom > viewportTop &&
        interactionRect.top < viewportTop + viewportHeight
      ) {
        activate(interacted);
        return;
      }
      activate(
        cards[
          selectFocusCard(
            rects,
            viewportTop,
            viewportHeight,
            active ? cards.indexOf(active) : -1,
          )
        ],
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onScroll = () => {
      interacted = undefined;
      schedule();
    };
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const discover = () => {
      for (const card of cards) card.removeAttribute("data-focus-target");
      const candidates = [
        ...root.querySelectorAll<HTMLElement>(".system-panel, [data-focus-card]"),
      ];
      // Never blur a container around a nested active quest card.
      cards = candidates.filter(
        (card) => !candidates.some((child) => child !== card && card.contains(child)),
      );
      for (const card of cards) card.setAttribute("data-focus-target", "true");
      resize?.disconnect();
      resize?.observe(root);
      cards.forEach((card) => resize?.observe(card));
      window.cancelAnimationFrame(frame);
      update();
      root.dataset.focusReady = "true";
    };
    const interact = (event: Event) => {
      if (event.target instanceof Node) {
        const card = cardFor(event.target);
        if (card) {
          interacted = card;
          activate(card);
        }
      }
    };
    const mutations = new MutationObserver(discover);
    discover();
    mutations.observe(root, { childList: true, subtree: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", onScroll);
    root.addEventListener("focusin", interact);
    root.addEventListener("pointerdown", interact, true);
    return () => {
      window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resize?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      root.removeEventListener("focusin", interact);
      root.removeEventListener("pointerdown", interact, true);
      delete root.dataset.focusReady;
      for (const card of cards) {
        card.removeAttribute("data-focus-target");
        card.removeAttribute("data-focus-active");
      }
    };
  }, [enabled]);

  return (
    <>
      <div className="scroll-focus-toolbar">
        <span>SCROLL TO FOCUS // ONE OBJECTIVE AT A TIME</span>
        <button type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
          {enabled ? "FOCUS VIEW ON" : "ALL PANELS"}
        </button>
      </div>
      <div ref={scope} className="scroll-focus">
        {children}
      </div>
    </>
  );
}
