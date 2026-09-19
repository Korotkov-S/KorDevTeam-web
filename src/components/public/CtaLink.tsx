import React from "react";
import { Link, useLocation } from "react-router-dom";
import { track, type AnalyticsEvent, type AnalyticsPayload } from "../../lib/analytics";

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
  const location = useLocation();
  const variantClassName = variant === "primary"
    ? "bg-[var(--public-blue)] text-white hover:bg-[var(--public-violet)] focus-visible:bg-[var(--public-violet)]"
    : "border border-[var(--public-ink)] text-[var(--public-ink)] hover:border-[var(--public-violet)] hover:text-[var(--public-violet)] focus-visible:border-[var(--public-violet)] focus-visible:text-[var(--public-violet)]";
  const trackedEvent: AnalyticsEvent | undefined = eventName
    ?? (to.includes("#contact") ? "service_cta_click" : undefined);

  const handleClick = () => {
    if (!trackedEvent) return;
    const payload: AnalyticsPayload = { path: location.pathname };
    const serviceMatch = location.pathname.match(/^\/services\/([^/]+)\/?$/);
    const projectMatch = to.match(/^\/cases\/([^/]+)\/?$/);
    if (serviceMatch) payload.serviceSlug = serviceMatch[1];
    if (projectMatch) payload.projectSlug = projectMatch[1];
    track(trackedEvent, payload);
  };

  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)] ${variantClassName}`}
      data-event-name={eventName}
      onClick={handleClick}
      to={to}
    >
      {children}
    </Link>
  );
}
