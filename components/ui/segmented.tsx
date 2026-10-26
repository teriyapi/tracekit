"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** A small radio group styled like the verdict bar's track. The selected pill slides between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    const button = buttonRefs.current[activeIndex];
    if (button) {
      indicator.style.width = `${button.offsetWidth}px`;
      indicator.style.transform = `translateX(${button.offsetLeft}px)`;
    }
    indicator.style.opacity = button ? "1" : "0";
    // Land in place on first paint, then animate every change after
    if (!indicator.dataset.ready) requestAnimationFrame(() => (indicator.dataset.ready = ""));
  }, [activeIndex, options.length]);

  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-flex h-8 shrink-0 items-stretch gap-0.5 rounded-md bg-muted p-[3px]", className)}>
      <span
        ref={indicatorRef}
        aria-hidden
        className="absolute inset-y-[3px] left-0 rounded-sm bg-background opacity-0 shadow-sm data-ready:transition-[transform,width,opacity] data-ready:duration-200 data-ready:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            buttonRefs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex items-center rounded-sm px-2.5 font-mono text-xs transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
