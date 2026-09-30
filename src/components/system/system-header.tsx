import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/class-names";

export interface SystemHeaderProps extends HTMLAttributes<HTMLElement> {
  readonly title: string;
  readonly label?: string;
}

export function SystemHeader({
  title,
  label = "SYSTEM",
  className,
  ...props
}: SystemHeaderProps) {
  return (
    <header className={cn("system-header", className)} {...props}>
      <span className="system-header__rule" aria-hidden="true" />
      <div>
        <p className="system-header__label">{label}</p>
        <p className="system-header__title">{title}</p>
      </div>
      <span className="system-header__rule" aria-hidden="true" />
    </header>
  );
}
