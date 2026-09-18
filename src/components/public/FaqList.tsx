import React from "react";
import type { FaqView } from "../../server/content/types";

export function FaqList({ items }: { items: FaqView[] }) {
  return <div className="divide-y divide-border border-y border-border">
    {items.map(item => <details key={item.question} className="group py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold marker:content-none">
        <span>{item.question}</span>
        <span aria-hidden="true" className="text-[var(--public-blue)] transition-transform duration-200 group-open:rotate-45">+</span>
      </summary>
      <p className="max-w-3xl pt-4 leading-7 text-[var(--public-subtle)]">{item.answer}</p>
    </details>)}
  </div>;
}
