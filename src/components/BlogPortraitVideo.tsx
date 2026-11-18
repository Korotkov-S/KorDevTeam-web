import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Play } from "lucide-react";
import type { BlogVideo } from "../lib/blogVideo";

export function BlogPortraitVideo({ video, poster, title }: {
  video: BlogVideo;
  poster?: string;
  title: string;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    flushSync(() => setOpened(true));
    player.current?.focus();
    void player.current?.play().catch(() => {});
  }

  return (
    <div className="mx-auto w-full max-w-[320px] self-start lg:col-start-1 lg:row-span-2 lg:row-start-1">
      {opened ? (
        <video
          ref={player}
          src={video.url}
          poster={poster || undefined}
          aria-label={title}
          controls
          playsInline
          preload="none"
          onError={() => setFailed(true)}
          className="aspect-[9/16] w-full rounded-[1.5rem] bg-black object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={play}
          aria-label="Смотреть видео"
          className="relative isolate flex aspect-[9/16] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.5rem] bg-neutral-900 text-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--public-blue)]"
        >
          {poster ? <img src={poster} alt="" className="absolute inset-0 -z-10 size-full object-cover" /> : null}
          <span className="flex size-16 items-center justify-center rounded-full bg-black/75">
            <Play className="ml-0.5 size-7 fill-current" aria-hidden="true" />
          </span>
          <span className="absolute bottom-4 right-4 rounded-full bg-black/80 px-3 py-1 text-sm tabular-nums">{video.duration}</span>
        </button>
      )}
      {failed ? <p role="status" className="mt-3 text-sm">Видео временно недоступно.</p> : null}
      <noscript><a href={video.url}>Открыть видео</a></noscript>
    </div>
  );
}
