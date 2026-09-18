import React from "react";

export function Wordmark({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <span className={`font-semibold tracking-[-0.04em] text-[var(--public-ink)] ${className}`.trim()}>
      KorDevTeam
    </span>
  );
}
