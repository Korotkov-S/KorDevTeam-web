import React from "react";
import { Link } from "react-router-dom";
import type { ServiceCardView } from "../../server/content/types";

export function ServiceCard({ service }: { service: ServiceCardView }) {
  return <article className={`flex flex-col rounded-[var(--public-radius-card)] border p-6 ${service.priority ? "border-[var(--public-blue)] bg-card" : "border-border"}`}>
    <h3 className="text-2xl font-semibold leading-tight tracking-tight">{service.title}</h3>
    <p className="mt-4 mb-8 leading-7 text-[var(--public-subtle)]">{service.summary}</p>
    <Link to={`/services/${service.slug}/`} className="mt-auto w-fit font-semibold text-[var(--public-blue)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`Подробнее: ${service.title}`}>Подробнее <span aria-hidden="true">↗</span></Link>
  </article>;
}
