import React from "react";
import { Link } from "react-router-dom";
import type { CaseCardView } from "../../server/content/types";

const tones = {
  violet: "bg-[color:color-mix(in_srgb,var(--public-violet)_12%,var(--card))]",
  green: "bg-[color:color-mix(in_srgb,var(--public-green)_12%,var(--card))]",
  neutral: "bg-card",
};

export function CaseCard({ project, tone = "neutral" }: { project: CaseCardView; tone?: keyof typeof tones }) {
  const { image } = project;
  return <article className={`flex flex-col overflow-hidden rounded-[var(--public-radius-card)] border border-border ${tones[tone]}`}>
    {image && <img src={image.src} srcSet={image.srcSet || undefined} sizes="(min-width: 768px) 50vw, 100vw" width={image.width ?? undefined} height={image.height ?? undefined} alt={image.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />}
    <div className="flex flex-1 flex-col p-6 sm:p-8">
      {project.tags.length > 0 && <p className="mb-4 text-sm text-[var(--public-subtle)]">{project.tags.slice(0, 2).join(" / ")}</p>}
      <h3 className="text-2xl font-semibold tracking-tight">{project.title}</h3>
      <p className="mt-4 mb-6 max-w-xl leading-7 text-[var(--public-subtle)]">{project.result ?? project.summary}</p>
      <Link to={`/cases/${project.slug}/`} data-event-name="project_open" className="mt-auto w-fit font-semibold text-[var(--public-blue)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`Смотреть кейс: ${project.title}`}>Смотреть кейс <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}
