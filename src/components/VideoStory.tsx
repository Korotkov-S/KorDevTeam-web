import React, { useRef, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

export function VideoStory() {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    // Проверяем, что видео реально существует (иначе скрываем сторис)
    // Используем HEAD, чтобы не качать видео на главной странице.
    const url = isMobile ? "/defaultMob.MOV" : "/default.mp4";
    const controller = new AbortController();

    async function checkExists() {
      try {
        const head = await fetch(url, { method: "HEAD", signal: controller.signal, cache: "no-store" });
        if (head.ok) return setIsAvailable(true);

        // Некоторые хостинги могут не поддерживать HEAD → fallback на лёгкий GET
        const get = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
          headers: { Range: "bytes=0-0" },
        });
        setIsAvailable(get.ok);
      } catch {
        setIsAvailable(false);
      }
    }

    checkExists();
    return () => controller.abort();
  }, [isMobile]);

  const videoSrc = useMemo(() => (isMobile ? "/defaultMob.MOV" : "/default.mp4"), [isMobile]);
  const videoType = useMemo(() => (isMobile ? "video/quicktime" : "video/mp4"), [isMobile]);

  useEffect(() => {
    if (!isPreviewActive) return;
    const video = previewVideoRef.current;
    if (!video) return;
    video.load();
    video.play().catch(() => {});
  }, [isPreviewActive]);

  // Если видео отсутствует — скрываем сторис целиком
  if (isAvailable === false) return null;
  // Пока не проверили — тоже не показываем (чтобы не мигало)
  if (isAvailable === null) return null;

  return (
    <Link to="/video">
      <button
        className="relative w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden cursor-pointer hover:scale-105 transition-transform"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: `
            0 0 0 3px rgba(59, 130, 246, 0.5),
            0 0 10px rgba(59, 130, 246, 0.6),
            0 0 20px rgba(59, 130, 246, 0.4),
            inset 0 0 20px rgba(59, 130, 246, 0.2)
          `,
        }}
        onMouseEnter={() => {
          // Превью загружаем только по намерению пользователя (ускоряет первый экран)
          if (!isMobile) setIsPreviewActive(true);
        }}
        onMouseLeave={() => {
          if (!isMobile) setIsPreviewActive(false);
          const video = previewVideoRef.current;
          if (video) {
            video.pause();
            video.currentTime = 0;
          }
        }}
      >
        {/* Видео-превью не загружаем на старте: включаем только по hover на десктопе */}
        {!isMobile && isPreviewActive ? (
          <video
            ref={previewVideoRef}
            muted
            loop
            playsInline
            preload="none"
            className="w-full h-full object-cover pointer-events-none"
            onError={() => setIsAvailable(false)}
          >
            <source src={videoSrc} type={videoType} />
          </video>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </button>
    </Link>
  );
}

