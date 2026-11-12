import React, { useState } from "react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";

const presentationPath = "/presentations/kordev-outsourced-team-v4";

export function HomePresentationVideo() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="relative shrink-0">
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Смотреть видеопрезентацию, 57 секунд"
            className="relative block size-12 cursor-pointer rounded-full border-[3px] border-[var(--public-surface)] ring-1 ring-[var(--public-blue)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--public-blue)] max-[360px]:size-10 sm:size-20 sm:border-4 motion-safe:animate-[home-presentation-nudge_650ms_ease_1.2s_2]"
          >
            <img src={`${presentationPath}-preview.jpg`} alt="" width="192" height="192" className="size-full rounded-full object-cover" />
            <span className="absolute right-0 bottom-0 grid size-5 place-items-center rounded-full bg-black/80 text-white sm:size-8">
              <Play aria-hidden="true" className="size-2.5 fill-current sm:size-3.5" />
            </span>
          </button>
        </DialogTrigger>
        <span aria-hidden="true" className="absolute top-full left-1/2 mt-0.5 -translate-x-1/2 text-[10px] whitespace-nowrap text-[var(--public-subtle)] sm:mt-1 sm:text-xs">
          Видео · 0:57
        </span>
      </div>
      <DialogContent
        aria-describedby={undefined}
        closeLabel="Закрыть видео"
        className="gap-3 rounded-2xl p-3 sm:max-w-4xl sm:p-5"
      >
        <DialogTitle className="pr-8 text-sm leading-5 sm:text-lg">Ваш отдел разработки на аутсорсе</DialogTitle>
        {open && (
          <video
            controls
            autoPlay
            playsInline
            src={`${presentationPath}.mp4`}
            className="aspect-video max-h-[calc(100dvh-6rem)] w-full rounded-lg bg-black object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
