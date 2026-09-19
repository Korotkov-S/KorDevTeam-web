import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LeadCtaSection } from "../components/public/LeadCtaSection";
import { Section, SectionHeading } from "../components/public/Section";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCw,
  ArrowLeft,
} from "lucide-react";

export function VideoPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    // Автозапуск видео при загрузке страницы
    if (videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, []);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const restartVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <>
      <Section className="min-h-screen pt-28 lg:pt-32">
          {/* Кнопка возврата */}
          <div className="relative mb-8">
            <button
              type="button"
              onClick={() => navigate(-1)}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-[var(--public-ink)] transition-colors hover:bg-card"
            >
              <ArrowLeft className="h-5 w-5" />
              Назад
            </button>
          </div>

          <SectionHeading
            level={1}
            eyebrow="Видео"
            title="Видео KorDevTeam"
            description="Видео-презентация команды: наш подход к разработке и примеры работ."
          />
          {/* Видео */}
          <div className="mx-auto mt-10 w-full max-w-5xl">
            <div className="relative aspect-video overflow-hidden rounded-[var(--public-radius-card)] border border-border bg-black pointer-events-none">
              {isVideoError ? (
                <div className="w-full h-full flex items-center justify-center text-white/80 px-6 text-center">
                  Видео не найдено или временно недоступно.
                </div>
              ) : (
                <video
                  ref={videoRef}
                  controls
                  muted={isMuted}
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain pointer-events-auto"
                  onError={() => setIsVideoError(true)}
                >
                  <source
                    src={isMobile ? "/defaultMob.MOV" : "/default.mp4"}
                    type={isMobile ? "video/quicktime" : "video/mp4"}
                  />
                </video>
              )}
            </div>
          </div>

          {/* Video controls */}
          {!isVideoError && (
          <div
            className="relative mx-auto mt-4 flex w-full max-w-5xl items-center justify-center gap-4"
          >
            <button
              type="button"
              onClick={togglePlayPause}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={isPlaying ? "Поставить видео на паузу" : "Воспроизвести видео"}
              className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
              className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            >
              {isMuted ? (
                <VolumeX className="h-6 w-6" />
              ) : (
                <Volume2 className="h-6 w-6" />
              )}
            </button>
            <button
              type="button"
              onClick={restartVideo}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="Начать видео сначала"
              className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            >
              <RotateCw className="h-6 w-6" />
            </button>
          </div>
          )}
      </Section>
      <LeadCtaSection
        pagePath="/video/"
        title="Обсудить похожий проект"
        description="Расскажите о задаче — предложим следующий шаг в течение рабочего дня."
      />
    </>
  );
}
