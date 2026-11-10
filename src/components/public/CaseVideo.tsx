import { useRef } from "react";
import { CASE_VIDEO, CASE_VIDEO_PATH } from "../../lib/caseVideo";
import { SITE_ORIGIN } from "../../server/seo/metadata";

function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CaseVideo({ start }: { start: number | null }) {
  const player = useRef<HTMLVideoElement>(null);
  const video = CASE_VIDEO;
  const pageUrl = `${SITE_ORIGIN}${CASE_VIDEO_PATH}`;
  const posterUrl = `${SITE_ORIGIN}${video.poster}`;
  const source = start === null ? video.src : `${video.src}#t=${start}`;

  return (
    <section id="case-video" aria-label={video.name} className="my-8 scroll-mt-28" itemScope itemType="https://schema.org/VideoObject">
      <meta itemProp="name" content={video.name} />
      <meta itemProp="description" content={video.description} />
      <meta itemProp="uploadDate" content={video.uploadDate} />
      <meta itemProp="duration" content="PT5M3.4S" />
      <meta itemProp="isFamilyFriendly" content="true" />
      <link itemProp="url" href={pageUrl} />
      <link itemProp="contentUrl" href={video.src} />
      <link itemProp="thumbnailUrl" href={posterUrl} />
      <span itemProp="thumbnail" itemScope itemType="https://schema.org/ImageObject">
        <link itemProp="contentUrl" href={posterUrl} />
        <meta itemProp="width" content="960" />
        <meta itemProp="height" content="540" />
      </span>
      <video key={source} ref={player} controls playsInline preload={start === null ? "none" : "metadata"}
        poster={video.poster} width={960} height={540} aria-label={video.name}
        className="aspect-video h-auto w-full rounded-xl border border-border/50 bg-black object-contain">
        <source src={source} type="video/mp4" />
        <a href={source}>Открыть видео</a>
      </video>
      <h4 className="mb-3 mt-6 text-lg font-semibold">Главы видео</h4>
      <ol className="space-y-2 text-base leading-6">
        {video.chapters.map((chapter, index) => (
          <li key={chapter.start} itemProp="hasPart" itemScope itemType="https://schema.org/Clip">
            <meta itemProp="startOffset" content={String(chapter.start)} />
            <meta itemProp="endOffset" content={String(video.chapters[index + 1]?.start ?? video.duration)} />
            <a itemProp="url" href={`?t=${chapter.start}#case-video`}
              onClick={event => {
                const current = player.current;
                if (start === chapter.start && current && current.readyState > 0
                  && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                  current.currentTime = start;
                }
              }}
              className="inline-flex items-baseline gap-3 text-[var(--public-blue)] underline underline-offset-4">
              <span className="shrink-0 tabular-nums">{timestamp(chapter.start)}</span>
              <span itemProp="name">{chapter.name}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
