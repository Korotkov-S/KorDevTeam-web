import { motion, useMotionValue, useSpring } from "motion/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Circle,
  Cpu,
  Database,
  Settings,
  TrendingUp,
  Users,
  Zap,
  Code2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function Hero() {
  const { t } = useTranslation();
  const containerRef = useRef();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [reduceEffects, setReduceEffects] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { stiffness: 50, damping: 20 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqMobile = window.matchMedia("(max-width: 767px)");
    const mqReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setReduceEffects(Boolean(mqMobile.matches || mqReducedMotion.matches));
    };
    update();

    // Safari < 14 fallback: addListener/removeListener
    const add = (mq: MediaQueryList) => {
      // eslint-disable-next-line deprecation/deprecation
      if (mq.addEventListener) mq.addEventListener("change", update);
      // eslint-disable-next-line deprecation/deprecation
      else mq.addListener(update);
    };
    const remove = (mq: MediaQueryList) => {
      // eslint-disable-next-line deprecation/deprecation
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      // eslint-disable-next-line deprecation/deprecation
      else mq.removeListener(update);
    };

    add(mqMobile);
    add(mqReducedMotion);
    return () => {
      remove(mqMobile);
      remove(mqReducedMotion);
    };
  }, []);

  useEffect(() => {
    if (reduceEffects) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY, reduceEffects]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth" });
  };

  const stats = useMemo(
    () => [
      { value: 95, suffix: "%", label: t("hero.stats.clients"), icon: TrendingUp },
      { value: 30, suffix: "%", label: t("hero.stats.cheaper"), icon: Zap },
      { value: 83, suffix: "%", label: t("hero.stats.onTime"), icon: Users },
    ],
    [t]
  );

  const titleParts = useMemo(() => {
    const title = String(t("hero.title") ?? "");
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length <= 2) return { a: title, b: "", c: "" };
    return {
      a: words[0],
      b: words[1],
      c: words.slice(2).join(" "),
    };
  }, [t]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center pt-32 pb-20 px-4 sm:px-6 overflow-hidden"
    >
      {/* Background effects: disable heavy animation on mobile / reduced motion */}
      {reduceEffects ? (
        <>
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px)",
              backgroundSize: "80px 80px",
            }}
          />
          <div
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
        </>
      ) : (
        <>
          {/* Animated grid background with parallax */}
          <motion.div
            className="absolute inset-0 opacity-10"
            style={{
              x: smoothMouseX,
              y: smoothMouseY,
            }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{
                backgroundPosition: ["0% 0%", "100% 100%"],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px)",
                backgroundSize: "80px 80px",
              }}
            />
          </motion.div>

          {/* Radiant gradient orbs */}
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              x: [0, 50, 0],
              y: [0, 30, 0],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background:
                "radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full"
            animate={{
              scale: [1, 1.4, 1],
              x: [0, -50, 0],
              y: [0, -30, 0],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background:
                "radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
        </>
      )}

      {!reduceEffects && (
      <>
      {/* Floating particles with glow */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-400 rounded-full"
            initial={{
              x:
                Math.random() *
                (typeof window !== "undefined" ? window.innerWidth : 1920),
              y:
                Math.random() *
                (typeof window !== "undefined" ? window.innerHeight : 1080),
              opacity: 0,
            }}
            animate={{
              y: [null, Math.random() * -300 - 100],
              opacity: [0, 0.8, 0],
              scale: [0, 1.5, 0],
            }}
            transition={{
              duration: Math.random() * 4 + 3,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeOut",
            }}
            style={{
              boxShadow: "0 0 10px rgba(59, 130, 246, 0.8)",
            }}
          />
        ))}
      </div>

      {/* Floating automation icons with connections */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[
          { Icon: Settings, delay: 0, x: "20%", y: "20%", targetX: "25%", targetY: "25%" },
          { Icon: Database, delay: 1, x: "80%", y: "30%", targetX: "75%", targetY: "35%" },
          { Icon: BarChart3, delay: 2, x: "15%", y: "70%", targetX: "20%", targetY: "65%" },
          { Icon: Cpu, delay: 1.5, x: "85%", y: "75%", targetX: "80%", targetY: "70%" },
        ].map((item, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{ left: item.x, top: item.y }}
            animate={{
              left: [item.x, item.targetX, item.x],
              top: [item.y, item.targetY, item.y],
              opacity: [0, 0.2, 0],
              scale: [0, 1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: item.delay,
              ease: "easeInOut",
            }}
          >
            <item.Icon className="w-16 h-16 sm:w-24 sm:h-24 text-blue-500" strokeWidth={1} />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-blue-500/30"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: item.delay,
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* Animated network connections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.15 }}>
        <motion.line
          x1="20%"
          y1="20%"
          x2="80%"
          y2="30%"
          stroke="url(#lineGradient1)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="80%"
          y1="30%"
          x2="85%"
          y2="75%"
          stroke="url(#lineGradient2)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 1, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="15%"
          y1="70%"
          x2="85%"
          y2="75%"
          stroke="url(#lineGradient3)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="20%"
          y1="20%"
          x2="15%"
          y2="70%"
          stroke="url(#lineGradient4)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {[...Array(6)].map((_, i) => (
          <motion.path
            key={i}
            d={`M ${i % 2 === 0 ? 0 : "100%"} ${20 + i * 15}% Q 50% ${
              30 + i * 10
            }% ${i % 2 === 0 ? "100%" : 0} ${40 + i * 15}%`}
            stroke="url(#gradient)"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.3 }}
            transition={{
              pathLength: { duration: 3, delay: i * 0.3, repeat: Infinity },
              opacity: { duration: 0.5, delay: i * 0.3 },
            }}
          />
        ))}

        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="lineGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient4" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Pulsing data nodes */}
      {[
        { x: "20%", y: "20%", delay: 0 },
        { x: "80%", y: "30%", delay: 0.5 },
        { x: "15%", y: "70%", delay: 1 },
        { x: "85%", y: "75%", delay: 1.5 },
      ].map((node, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{ left: node.x, top: node.y }}
        >
          <motion.div
            className="w-3 h-3 rounded-full bg-blue-500"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.8, 0.3, 0.8],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: node.delay,
            }}
            style={{
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.8)",
            }}
          />
        </motion.div>
      ))}
      </>
      )}

      {/* Animated code/terminal effect */}
      <div className="absolute top-32 right-10 hidden lg:block pointer-events-none">
        <CodeTerminal />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto w-full relative z-10">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full bg-card/60 dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2 mb-8 backdrop-blur-sm"
          >
            <Code2 className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-foreground/90">{t("hero.badge")}</span>
          </motion.div>

          <div className="mb-6">
            <AnimatedTitle a={titleParts.a} b={titleParts.b} c={titleParts.c} />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10"
          >
            {t("hero.subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <MagneticButton mousePosition={mousePosition}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection("contact")}
                className="group relative px-8 py-4 rounded-xl overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500"
                  whileHover={{ scale: 1.05 }}
                />
                <motion.div
                  className="absolute inset-0 -translate-x-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                  }}
                  animate={{ translateX: ["-100%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                />
                <span className="relative flex items-center gap-2 text-white font-medium">
              {t("hero.discussProject")}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>
            </MagneticButton>

            <MagneticButton mousePosition={mousePosition}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection("services")}
                className="px-8 py-4 rounded-xl border border-border dark:border-white/20 bg-card/60 dark:bg-white/5 backdrop-blur-sm text-foreground dark:text-white hover:bg-accent/60 dark:hover:bg-white/10 transition-colors relative overflow-hidden group"
              >
                <span className="relative z-10">{t("hero.ourServices")}</span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-blue-600/0 via-blue-600/20 to-blue-600/0"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.6 }}
                />
              </motion.button>
            </MagneticButton>
          </motion.div>
          </div>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.3 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
        >
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30, rotateX: -20 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{
                  duration: 0.6,
                  delay: 1.4 + index * 0.15,
                  type: "spring",
                  stiffness: 100,
                }}
                whileHover={{
                  y: -10,
                  scale: 1.02,
                  transition: { duration: 0.2 },
                }}
                style={{ transformPerspective: 1000 }}
                className="group relative"
              >
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  animate={{
                    background: [
                      "linear-gradient(0deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))",
                      "linear-gradient(360deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                />

                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl" />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-purple-500/0 rounded-2xl"
                  whileHover={{
                    background:
                      "linear-gradient(to bottom right, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))",
                  }}
                />

                <div className="relative p-6 sm:p-8 backdrop-blur-xl rounded-2xl border border-border dark:border-white/10">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <motion.div
                      className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 relative overflow-hidden"
                      whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white relative z-10" />
                      <motion.div
                        className="absolute inset-0 bg-blue-400"
                        animate={{ opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{ filter: "blur(10px)" }}
                      />
                    </motion.div>
                    <motion.div
                      className="w-2 h-2 rounded-full bg-green-400"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.7, 1],
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{
                        boxShadow: "0 0 10px rgba(74, 222, 128, 0.8)",
                      }}
                    />
              </div>

                  <div className="flex items-baseline mb-2">
                    <CountUpNumber value={stat.value} delay={1.6 + index * 0.15} />
                    <motion.span
                      className="text-2xl sm:text-3xl font-bold text-blue-400 ml-1"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 1.7 + index * 0.15 }}
                    >
                      {stat.suffix}
                    </motion.span>
            </div>

                  <p className="text-sm sm:text-base text-muted-foreground">{stat.label}</p>
              </div>
              </motion.div>
            );
          })}
        </motion.div>
            </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2 text-muted-foreground"
        >
          <span className="text-xs uppercase tracking-wider">{t("hero.scroll")}</span>
          <div className="w-6 h-10 rounded-full border-2 border-border flex items-start justify-center p-2">
            <motion.div
              animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="w-1 h-2 bg-blue-500 rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function AnimatedTitle({ a, b, c }: { a: string; b: string; c: string }) {
  const parts = [
    { text: a, className: "text-foreground", isGradient: false },
    {
      text: b,
      className:
        "bg-gradient-to-r from-blue-400 via-purple-500 to-blue-600 bg-clip-text text-transparent",
      isGradient: true,
    },
    { text: c, className: "text-foreground", isGradient: false },
  ].filter((x) => x.text);

  return (
    <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-tight">
      {parts.map((word, wordIndex) => (
        <motion.div
          key={`${word.text}-${wordIndex}`}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 + wordIndex * 0.2 }}
          className={wordIndex === 2 ? "mt-2" : ""}
        >
          {word.isGradient ? (
            <span className="relative inline-block">
              <motion.span
                className={word.className}
                initial={{ backgroundPosition: "0% 50%" }}
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 5, repeat: Infinity }}
                style={{ backgroundSize: "200% 200%" }}
              >
                {word.text.split("").map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                    className="inline-block"
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.span>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 1.2 }}
                className="absolute bottom-1 sm:bottom-2 left-0 right-0 h-2 sm:h-3 bg-gradient-to-r from-blue-500/30 to-purple-500/30 blur-sm"
                style={{ originX: 0 }}
              />
            </span>
          ) : (
            <span className={word.className}>
              {word.text.split("").map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.2 + wordIndex * 0.2 + i * 0.03,
                  }}
                  className="inline-block"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </span>
          )}
        </motion.div>
      ))}
    </h1>
  );
}

function MagneticButton(props: any) {
  const { children, mousePosition } = props || {};
  const ref = useRef();
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = (ref as any).current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distanceX = (mousePosition?.x ?? 0) - centerX;
    const distanceY = (mousePosition?.y ?? 0) - centerY;
    const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

    if (distance < 120) {
      setOffset({
        x: distanceX * 0.25,
        y: distanceY * 0.25,
      });
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }, [mousePosition]);

  return (
    <motion.div
      ref={ref}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15 }}
    >
      {children}
    </motion.div>
  );
}

function CountUpNumber({ value, delay }: { value: number; delay: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let current = 0;
      const increment = value / 50;
      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCount(value);
          clearInterval(interval);
        } else {
          setCount(Math.floor(current));
        }
      }, 30);
      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return (
    <motion.span
      className="text-4xl sm:text-5xl font-bold text-foreground"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
    >
      {count}
    </motion.span>
  );
}

// Animated code terminal
function CodeTerminal() {
  const codeLines = [
    "$ npm run build",
    "✓ Building application...",
    "✓ Optimizing performance...",
    "✓ Deploy successful",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 1.5 }}
      className="bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-lg p-4 w-72"
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="text-xs text-gray-400 ml-2">terminal</span>
      </div>
      <div className="space-y-2 font-mono text-xs">
        {codeLines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2 + i * 0.3 }}
            className={line.startsWith("✓") ? "text-green-400" : "text-gray-300"}
          >
            {line}
          </motion.div>
        ))}
        <motion.div
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-blue-400"
        >
          _
        </motion.div>
      </div>
    </motion.div>
  );
}
