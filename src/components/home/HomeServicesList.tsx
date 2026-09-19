import React from "react";
import { Link } from "react-router-dom";
import type { ServiceCardView } from "../../server/content/types";

export function HomeServicesList({ services }: { services: ServiceCardView[] }) {
  return <ol className="mt-10 border-t border-[var(--public-ink)]">
    {services.map((service, index) => {
      const number = String(index + 1).padStart(2, "0");
      return <li key={service.slug} data-service-number={number} className="border-b border-border">
        <Link
          to={`/services/${service.slug}/`}
          aria-label={`Подробнее: ${service.title}`}
          className="group grid gap-5 py-7 transition-[background-color,padding] duration-300 hover:bg-[var(--public-service-hover)] focus-visible:bg-[var(--public-service-hover)] focus-visible:outline-none sm:grid-cols-[4rem_minmax(0,1fr)_minmax(14rem,0.65fr)_3rem] sm:items-center sm:px-4 sm:hover:px-6"
        >
          <span className="text-sm font-semibold text-[var(--public-violet)]">{number}</span>
          <h3 className="text-balance text-3xl font-medium leading-[0.98] tracking-[-0.04em] text-[var(--public-ink)] sm:text-4xl">{service.title}</h3>
          <p className="max-w-xl leading-7 text-[var(--public-subtle)]">{service.summary}</p>
          <span aria-hidden="true" className="text-3xl transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
        </Link>
      </li>;
    })}
  </ol>;
}
