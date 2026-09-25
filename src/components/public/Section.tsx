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
  tone = "default",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  level?: 1 | 2;
  tone?: "default" | "inverse";
}): React.JSX.Element {
  const Heading = level === 1 ? "h1" : "h2";
  const inverse = tone === "inverse";

  return (
    <div className="max-w-3xl">
      {eyebrow ? <p className={`mb-3 text-sm font-semibold uppercase tracking-[0.14em] ${inverse ? "text-[#a99cff]" : "text-[var(--public-violet)]"}`}>{eyebrow}</p> : null}
      <Heading className={`text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl ${inverse ? "text-white" : "text-[var(--public-ink)]"}`}>
        {title}
      </Heading>
      {description ? <p className={`mt-5 max-w-2xl text-base leading-7 sm:text-lg ${inverse ? "text-white/70" : "text-[var(--public-subtle)]"}`}>{description}</p> : null}
    </div>
  );
}
