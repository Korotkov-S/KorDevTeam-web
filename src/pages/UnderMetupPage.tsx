import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Play } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTranslation } from "react-i18next";

interface UnderMetupVideoMeta {
  title: string;
  date: string;
  duration: string;
  tags: string[];
  vkUrl: string;
}

export function UnderMetupPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [meta, setMeta] = useState<UnderMetupVideoMeta | null>(null);
  const [vkEmbedUrl, setVkEmbedUrl] = useState<string>("");

  const navigateGoBack = useCallback(() => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  const videosData = useMemo<Record<string, UnderMetupVideoMeta>>(() => ({
    "video-1": {
      title: t("underMetup.videos.video1.title"),
      date: t("underMetup.videos.video1.date"),
      duration: t("underMetup.videos.video1.duration"),
      tags: t("underMetup.videos.video1.tags", {
        returnObjects: true,
      }) as string[],
      vkUrl: t("underMetup.videos.video1.vkUrl"),
    },
    "video-2": {
      title: t("underMetup.videos.video2.title"),
      date: t("underMetup.videos.video2.date"),
      duration: t("underMetup.videos.video2.duration"),
      tags: t("underMetup.videos.video2.tags", {
        returnObjects: true,
      }) as string[],
      vkUrl: t("underMetup.videos.video2.vkUrl"),
    },
    "video-3": {
      title: t("underMetup.videos.video3.title"),
      date: t("underMetup.videos.video3.date"),
      duration: t("underMetup.videos.video3.duration"),
      tags: t("underMetup.videos.video3.tags", {
        returnObjects: true,
      }) as string[],
      vkUrl: t("underMetup.videos.video3.vkUrl"),
    },
  }), [t]);

  // Функция для преобразования URL VK в embed URL
  const convertVkUrlToEmbed = (url: string): string => {
    // Если это уже embed URL, возвращаем как есть
    if (url.includes("video_ext.php")) {
      return url;
    }
    
    // Извлекаем параметры из URL VK
    // Формат: https://vk.com/video-{owner_id}_{video_id}
    const match = url.match(/video(-?\d+)_(\d+)/);
    if (match) {
      const ownerId = match[1];
      const videoId = match[2];
      // VK embed URL формат
      return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hash=&hd=1`;
    }
    
    // Если формат не распознан, возвращаем исходный URL
    return url;
  };

  useEffect(() => {
    if (!slug) {
      navigateGoBack();
      return;
    }

    const videoMeta = videosData[slug];
    if (!videoMeta) {
      navigateGoBack();
      return;
    }

    setMeta(videoMeta);
    const embedUrl = convertVkUrlToEmbed(videoMeta.vkUrl);
    setVkEmbedUrl(embedUrl);
  }, [slug, navigate, videosData, navigateGoBack]);

  useEffect(() => {
    if (meta) {
      document.title = `${meta.title} | Under Metup`;
    }
  }, [meta]);

  return (
    <div className="min-h-screen pt-20 under-metup-page">
      <div className="container mx-auto px-2 md:px-4 py-2 md:py-8">
        {/* Back Button */}
        <div className="mb-2 md:mb-8 relative" style={{ zIndex: 9999 }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateGoBack();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors relative"
            style={{ zIndex: 9999 }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t("underMetup.backToVideos")}
          </button>
        </div>

        {meta && (
          <article className="max-w-6xl mx-auto">
            {/* Video Header */}
            <header className="mb-2 md:mb-12 pb-2 md:pb-8 border-b border-border">
              <h1 className="text-xl md:text-4xl lg:text-5xl mb-2 md:mb-6">{meta.title}</h1>

              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-base text-muted-foreground mb-2 md:mb-6">
                <div className="flex items-center gap-1 md:gap-2">
                  <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                  <span>{meta.date}</span>
                </div>
                <div className="flex items-center gap-1 md:gap-2">
                  <Play className="w-3 h-3 md:w-4 md:h-4" />
                  <span>{meta.duration}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 md:gap-2">
                {meta.tags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors text-xs md:text-sm"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </header>

            {/* Video Player */}
            <div className="mb-4 md:mb-12">
              <div className="relative w-full bg-black rounded-lg overflow-hidden video-container">
                {vkEmbedUrl ? (
                  <iframe
                    src={vkEmbedUrl}
                    className="w-full h-full"
                    style={{ backgroundColor: "#000" }}
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
                    allowFullScreen
                    frameBorder="0"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <p>{t("underMetup.loadingVideo")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions under video (must be visible on first screen) */}
            <div className="under-metup-actions relative" style={{ zIndex: 9999 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigateGoBack();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors relative"
                style={{ zIndex: 9999 }}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("underMetup.backToVideos")}
              </button>
            </div>

            {/* Program Description */}
            {meta.title.includes("№1") && (
              <div className="hidden md:block mb-4 md:mb-12 p-3 md:p-6 bg-card border border-border rounded-lg text-sm md:text-base">
                <h2 className="text-2xl font-semibold mb-4">Программа митапа:</h2>
                <ul className="space-y-3 mb-6 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">🚀</span>
                    <span>Каждый юнит на счету</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">🖥</span>
                    <span>Основы безопасности в Web3. Как не стать жертвой взлома</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">#⃣</span>
                    <span>Платформа .NET</span>
                  </li>
                </ul>
                
                <h3 className="text-xl font-semibold mb-4 mt-8">Спикеры:</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">😊</span>
                    <div>
                      <strong className="text-foreground">Павел Ланцев</strong> - Android-lead, Windy.app
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">☺</span>
                    <div>
                      <strong className="text-foreground">Кирилл Никитин</strong> - Smart-Contract Security Researcher, Независимый исследователь
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">😉</span>
                    <div>
                      <strong className="text-foreground">Николай Воронин</strong> - Руководитель группы разработки бэкофиса Мультифида, Altenar
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {meta.title.includes("№2") && (
              <div className="hidden md:block mb-4 md:mb-12 p-3 md:p-6 bg-card border border-border rounded-lg text-sm md:text-base">
                <h2 className="text-2xl font-semibold mb-4">Программа митапа:</h2>
                <ul className="space-y-3 mb-6 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">ℹ️</span>
                    <span>Data Driven Development: сначала данные, потом код</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">📞</span>
                    <span>Позвони мне, позвони при помощи WebRTC</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">👥</span>
                    <span>Нетворкинг в IT для начинающих: как сделать первые шаги и построить сеть контактов</span>
                  </li>
                </ul>
                
                <h3 className="text-xl font-semibold mb-4 mt-8">Спикеры:</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">😊</span>
                    <div>
                      <strong className="text-foreground">Павел Ланцев</strong> - Android-lead, Windy.app
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">☺️</span>
                    <div>
                      <strong className="text-foreground">Александр Коротков</strong> - RN-lead, LO
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">😉</span>
                    <div>
                      <strong className="text-foreground">Геннадий Коротков</strong> - Руководитель команды KorDevTeam
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {meta.title.includes("№3") && (
              <div className="hidden md:block mb-4 md:mb-12 p-3 md:p-6 bg-card border border-border rounded-lg text-sm md:text-base">
                <h2 className="text-2xl font-semibold mb-4">Программа митапа:</h2>
                <ul className="space-y-3 mb-6 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">🛠</span>
                    <span>Автоматизация коммитов и PR: стандарты и CI/CD на практике</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✅</span>
                    <span>Пора ломать шаблон: Учимся ставить цели на 2026 так, чтобы не забросить их 1 февраля.</span>
                  </li>
                </ul>
                
                <h3 className="text-xl font-semibold mb-4 mt-8">Спикеры:</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">☺️</span>
                    <div>
                      <strong className="text-foreground">Александр Коротков</strong> - СТО KorDevTeam
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">😉</span>
                    <div>
                      <strong className="text-foreground">Геннадий Коротков</strong> - Руководитель команды KorDevTeam
                    </div>
                  </li>
                </ul>
              </div>
            )}

          </article>
        )}
      </div>
    </div>
  );
}

