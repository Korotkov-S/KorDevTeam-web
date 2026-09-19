import React from "react";
import { Link } from "react-router-dom";
import type { CaseCardView } from "../../server/content/types";
import { track } from "../../lib/analytics";

const layouts = ["wide", "compact", "compact", "wide"] as const;
const cardStyles = [
  "bg-[#4f2bc7] text-white",
  "bg-[#cf3d18] text-white",
  "bg-[#16713b] text-white",
  "bg-[#3437ee] text-white",
] as const;

export function HomeCaseMosaic({ projects }: { projects: CaseCardView[] }) {
  return <div className="mt-10 grid gap-4 lg:grid-cols-12 lg:gap-5">
    {projects.map((project, index) => {
      const layout = layouts[index % layouts.length];
      const isWide = layout === "wide";
      return <article
        key={project.slug}
        data-home-case-layout={layout}
        className={`group overflow-hidden rounded-[2rem] ${isWide ? "lg:col-span-7" : "lg:col-span-5"} ${cardStyles[index % cardStyles.length]}`}
      >
        <Link
          to={`/cases/${project.slug}/`}
          data-event-name="project_open"
          onClick={() => track("project_open", { path: `/cases/${project.slug}/`, projectSlug: project.slug })}
          className="flex h-full min-h-[30rem] flex-col focus-visible:outline-4 focus-visible:outline-offset-[-6px] focus-visible:outline-white sm:min-h-[36rem]"
          aria-label={`Смотреть кейс: ${project.title}`}
        >
          {project.image ? <div className="m-4 mb-0 overflow-hidden rounded-[1.35rem] bg-white/10 sm:m-5 sm:mb-0">
            <img
              src={project.image.src}
              srcSet={project.image.srcSet || undefined}
              sizes={isWide ? "(min-width: 1024px) 58vw, 100vw" : "(min-width: 1024px) 42vw, 100vw"}
              width={project.image.width ?? undefined}
              height={project.image.height ?? undefined}
              alt={project.image.alt}
              loading="lazy"
              className="h-64 w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.025] sm:h-80"
            />
          </div> : <div aria-hidden="true" className="relative m-4 mb-0 h-64 overflow-hidden rounded-[1.35rem] bg-white/12 sm:m-5 sm:mb-0 sm:h-80">
            <span className="absolute -right-5 -top-14 text-[13rem] font-semibold leading-none tracking-[-0.09em] text-white/14">0{index + 1}</span>
            <span className="absolute bottom-5 left-5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#10131f]">KorDevTeam</span>
          </div>}
          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <div className="mb-5 flex flex-wrap gap-2">
              {project.tags.slice(0, 2).map(tag => <span key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#10131f]">{tag}</span>)}
            </div>
            <h3 className={`max-w-3xl text-balance font-medium leading-[0.98] tracking-[-0.045em] ${isWide ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{project.title}</h3>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">{project.result ?? project.summary}</p>
            <span className="mt-auto pt-8 text-sm font-semibold">Смотреть кейс <span aria-hidden="true">↗</span></span>
          </div>
        </Link>
      </article>;
    })}
  </div>;
}
