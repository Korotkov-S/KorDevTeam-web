import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";

export function VideoStory() {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
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
    // Автозапуск превью видео
    if (previewVideoRef.current) {
      previewVideoRef.current.play().catch(() => {});
    }
  }, []);

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
      >
        <video
          ref={previewVideoRef}
          muted
          loop
          playsInline
          className="w-full h-full object-cover pointer-events-none"
        >
          <source src={isMobile ? "/defaultMob.MOV" : "/default.mp4"} type={isMobile ? "video/quicktime" : "video/mp4"} />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </button>
    </Link>
  );
}

