import React from "react";

export function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1320px] px-5 py-16 sm:px-8 lg:px-10 lg:py-24 ${className}`.trim()}>
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  level = 2,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  level?: 1 | 2;
}): React.JSX.Element {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className="max-w-3xl">
      {eyebrow ? <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--public-violet)]">{eyebrow}</p> : null}
      <Heading className="text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] text-[var(--public-ink)] sm:text-5xl">
        {title}
      </Heading>
      {description ? <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--public-subtle)] sm:text-lg">{description}</p> : null}
    </div>
  );
}
