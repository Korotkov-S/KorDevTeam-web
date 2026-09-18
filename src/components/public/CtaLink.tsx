import React from "react";
import { Link } from "react-router-dom";

export function CtaLink({
  to,
  children,
  variant = "primary",
  eventName,
}: {
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  eventName?: "service_cta_click" | "project_open";
}): React.JSX.Element {
  const variantClassName = variant === "primary"
    ? "bg-[var(--public-blue)] text-white hover:bg-[var(--public-violet)] focus-visible:bg-[var(--public-violet)]"
    : "border border-[var(--public-ink)] text-[var(--public-ink)] hover:border-[var(--public-violet)] hover:text-[var(--public-violet)] focus-visible:border-[var(--public-violet)] focus-visible:text-[var(--public-violet)]";

  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)] ${variantClassName}`}
      data-event-name={eventName}
      to={to}
    >
      {children}
    </Link>
  );
}
