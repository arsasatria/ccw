import * as React from "react";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}

export function Logo({ className, showWordmark = true, size = 28 }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ccw-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="oklch(0.92 0.05 80)" />
            <stop offset="1" stopColor="oklch(0.68 0.1 65)" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#ccw-logo-grad)" />
        <path
          d="M9 22V10h2.6l3.4 6.5L18.4 10H21v12h-2.2v-7.7L16 19h-2l-2.8-4.7V22H9z"
          fill="var(--bg, #0c1116)"
        />
        <circle cx="23.5" cy="9.5" r="2" fill="var(--bg, #0c1116)" fillOpacity="0.85" />
      </svg>
      {showWordmark && (
        <span className="font-serif text-[14px] text-fg">
          ccw
        </span>
      )}
    </div>
  );
}
