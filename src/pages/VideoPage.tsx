import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Volume2, VolumeX, Play, Pause, RotateCw, ArrowLeft } from "lucide-react";

export function VideoPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    // Автозапуск видео при загрузке страницы
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
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
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center pt-20">
      <div className="w-full max-w-6xl mx-auto px-4">
        {/* Кнопка возврата */}
        <div className="mb-6 relative" style={{ zIndex: 10001 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/20 px-4 py-2 rounded-md flex items-center gap-2 cursor-pointer transition-colors"
            style={{ zIndex: 10001 }}
          >
            <ArrowLeft className="h-5 w-5" />
            Назад
          </button>
        </div>

        {/* Видео */}
        <div className="w-[80%] mx-auto">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden pointer-events-none">
            <video
              ref={videoRef}
              muted={isMuted}
              loop
              playsInline
              className="w-full h-full object-contain pointer-events-auto"
            >
              <source src={isMobile ? "/defaultMob.MOV" : "/default.mp4"} type={isMobile ? "video/quicktime" : "video/mp4"} />
            </video>
          </div>
        </div>
        
        {/* Video controls */}
        <div className="w-[80%] mx-auto mt-4 flex items-center justify-center gap-4 relative" style={{ zIndex: 9999 }}>
          <button
            type="button"
            onClick={togglePlayPause}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            style={{ zIndex: 10000 }}
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
            className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            style={{ zIndex: 10000 }}
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
            className="bg-white/90 hover:bg-white text-black h-12 w-12 rounded-full cursor-pointer flex items-center justify-center transition-colors"
            style={{ zIndex: 10000 }}
          >
            <RotateCw className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

