import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  size: number;
  opacity: number;
  delay: number;
  drift: number;
}

export function NewYearAnimation() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const { theme } = useTheme();

  useEffect(() => {
    // Создаем снежинки
    const flakes: Snowflake[] = [];
    const maxDrift = 20; // Уменьшаем максимальный дрейф
    for (let i = 0; i < 60; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 5 + Math.random() * 5, // 5-10 секунд
        size: 8 + Math.random() * 12, // 8-20px
        opacity: 0.4 + Math.random() * 0.6, // 0.4-1
        delay: Math.random() * 5, // 0-5 секунд задержки
        drift: -maxDrift + Math.random() * (maxDrift * 2), // -20px до +20px горизонтальное смещение
      });
    }
    setSnowflakes(flakes);
  }, []);

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden" style={{ width: '100vw', height: '100vh' }}>
        {snowflakes.map((flake) => {
          const isDark = theme === "dark";
          const snowColor = isDark 
            ? "rgba(255, 255, 255, 0.9)" 
            : "rgba(59, 130, 246, 0.8)"; // Белый для темной, синий для светлой
          const shadowColor = isDark 
            ? "rgba(255, 255, 255, 0.6)" 
            : "rgba(59, 130, 246, 0.5)";
          
          return (
            <div
              key={flake.id}
              className="absolute top-0 select-none"
              style={{
                left: `${flake.left}%`,
                fontSize: `${flake.size}px`,
                opacity: flake.opacity,
                animation: `snowfall-${flake.id} ${flake.animationDuration}s linear ${flake.delay}s infinite`,
                color: snowColor,
                textShadow: `0 0 8px ${shadowColor}`,
              }}
            >
              ❄
            </div>
          );
        })}
      </div>
      <style>{`
        ${snowflakes
          .map(
            (flake) => `
          @keyframes snowfall-${flake.id} {
            0% {
              transform: translateY(-100vh) translateX(0) rotate(0deg);
              opacity: 0;
            }
            10% {
              opacity: ${flake.opacity};
            }
            90% {
              opacity: ${flake.opacity};
            }
            100% {
              transform: translateY(100vh) translateX(${flake.drift}px) rotate(360deg);
              opacity: 0;
            }
          }
        `
          )
          .join("")}
      `}</style>
    </>
  );
}

