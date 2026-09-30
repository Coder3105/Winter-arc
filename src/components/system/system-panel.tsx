import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/class-names";

export interface SystemPanelProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly glow?: boolean;
  readonly as?: "article" | "section";
}

export function SystemPanel({
  children,
  className,
  eyebrow,
  title,
  glow = false,
  as: Element = "section",
  ...props
}: SystemPanelProps) {
  return (
    <Element
      className={cn("system-panel", glow && "system-panel--glow", className)}
      {...props}
    >
      {(eyebrow || title) && (
        <header className="system-panel__header">
          {eyebrow && <span className="system-panel__eyebrow">{eyebrow}</span>}
          {title && <h2 className="system-panel__title">{title}</h2>}
        </header>
      )}
      <div className="system-panel__content">{children}</div>
    </Element>
  );
}
