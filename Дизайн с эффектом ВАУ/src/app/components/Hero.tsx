import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, TrendingUp, Users, Zap, BarChart3, Settings, Database, Cpu, Circle, Terminal } from "lucide-react";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springConfig = { stiffness: 50, damping: 20 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const stats = [
    { value: 56, suffix: "%", label: "Рост конверсии", icon: TrendingUp },
    { value: 30, suffix: "%", label: "Снижение затрат", icon: Zap },
    { value: 63, suffix: "%", label: "Увеличение клиентов", icon: Users },
  ];

  return (
    <section 
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center pt-32 pb-20 px-4 sm:px-6 overflow-hidden"
    >
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
            backgroundImage: `linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px),
                             linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px)`,
            backgroundSize: '80px 80px'
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
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)",
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
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Floating particles with glow */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-400 rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1080),
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
            {/* Glowing ring around icon */}
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
        {/* Connection lines */}
        <motion.line
          x1="20%" y1="20%" x2="80%" y2="30%"
          stroke="url(#lineGradient1)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="80%" y1="30%" x2="85%" y2="75%"
          stroke="url(#lineGradient2)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 1, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="15%" y1="70%" x2="85%" y2="75%"
          stroke="url(#lineGradient3)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="20%" y1="20%" x2="15%" y2="70%"
          stroke="url(#lineGradient4)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0] }}
          transition={{ duration: 4, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Data flow lines */}
        {[...Array(6)].map((_, i) => (
          <motion.path
            key={i}
            d={`M ${i % 2 === 0 ? 0 : '100%'} ${20 + i * 15}% Q 50% ${30 + i * 10}% ${i % 2 === 0 ? '100%' : 0} ${40 + i * 15}%`}
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

      {/* Animated code/terminal effect */}
      <div className="absolute top-32 right-10 hidden lg:block pointer-events-none">
        <CodeTerminal />
      </div>

      {/* Dashboard widget */}
      <div className="absolute bottom-32 left-10 hidden lg:block pointer-events-none">
        <DashboardWidget />
      </div>

      {/* Floating mini cards */}
      <motion.div
        className="absolute top-48 left-20 hidden xl:block pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.8 }}
      >
        <MiniCard icon={<Circle className="w-4 h-4" />} label="AI Processing" value="95%" />
      </motion.div>

      <motion.div
        className="absolute bottom-48 right-20 hidden xl:block pointer-events-none"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.8, duration: 0.8 }}
      >
        <MiniCard icon={<Zap className="w-4 h-4" />} label="Response Time" value="12ms" />
      </motion.div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto w-full relative z-10">
        <div className="text-center mb-16">
          {/* Main title with letter animation */}
          <div className="mb-6">
            <AnimatedTitle />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10"
          >
            Разработка программного обеспечения корпоративного уровня с использованием передовых технологий
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
                className="group relative px-8 py-4 rounded-xl overflow-hidden"
              >
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500"
                  whileHover={{ scale: 1.05 }}
                />
                {/* Animated shine */}
                <motion.div
                  className="absolute inset-0 -translate-x-full"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                  }}
                  animate={{ translateX: ["-100%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                />
                <span className="relative flex items-center gap-2 text-white font-medium">
                  Обсудить проект
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>
            </MagneticButton>

            <MagneticButton mousePosition={mousePosition}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 transition-colors relative overflow-hidden group"
              >
                <span className="relative z-10">Наши работы</span>
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

        {/* Stats Cards */}
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
                  transition: { duration: 0.2 }
                }}
                style={{ transformPerspective: 1000 }}
                className="group relative"
              >
                {/* Animated border */}
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
                    background: "linear-gradient(to bottom right, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))"
                  }}
                />
                
                <div className="relative p-6 sm:p-8 backdrop-blur-xl rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <motion.div 
                      className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 relative overflow-hidden"
                      whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white relative z-10" />
                      {/* Icon glow */}
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
                        opacity: [1, 0.7, 1]
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
                  
                  <p className="text-sm sm:text-base text-gray-400">{stat.label}</p>
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
          className="flex flex-col items-center gap-2 text-gray-500"
        >
          <span className="text-xs uppercase tracking-wider">Прокрутите</span>
          <div className="w-6 h-10 rounded-full border-2 border-gray-700 flex items-start justify-center p-2">
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

// Animated title with character-by-character animation
function AnimatedTitle() {
  const words = [
    { text: "Цифровая", className: "text-white" },
    { text: "трансформация", className: "bg-gradient-to-r from-blue-400 via-purple-500 to-blue-600 bg-clip-text text-transparent", isGradient: true },
    { text: "вашего бизнеса", className: "text-white" },
  ];

  return (
    <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-tight">
      {words.map((word, wordIndex) => (
        <motion.div
          key={wordIndex}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 + wordIndex * 0.2 }}
          className={`${wordIndex === 2 ? 'mt-2' : wordIndex === 1 ? '' : ''}`}
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
              {/* Animated underline */}
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
                  transition={{ duration: 0.3, delay: 0.2 + wordIndex * 0.2 + i * 0.03 }}
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

// Magnetic Button
function MagneticButton({ 
  children, 
  mousePosition 
}: { 
  children: React.ReactNode;
  mousePosition: { x: number; y: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!ref.current) return;
    
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distanceX = mousePosition.x - centerX;
    const distanceY = mousePosition.y - centerY;
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

// Count up animation component
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
      className="text-4xl sm:text-5xl font-bold text-white"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
    >
      {count}
    </motion.span>
  );
}

// Mini floating card component
function MiniCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-lg p-3 w-40"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-blue-400">{icon}</div>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </motion.div>
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
        <Terminal className="w-3.5 h-3.5 text-gray-400 ml-2" />
        <span className="text-xs text-gray-400">terminal</span>
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

// Dashboard widget
function DashboardWidget() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 1.8 }}
      className="bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-lg p-4 w-64"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">Analytics</span>
        <BarChart3 className="w-4 h-4 text-blue-400" />
      </div>
      
      <div className="space-y-2">
        {[
          { label: "Users", value: 85, color: "bg-blue-500" },
          { label: "Revenue", value: 92, color: "bg-purple-500" },
          { label: "Growth", value: 78, color: "bg-cyan-500" },
        ].map((item, i) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>{item.label}</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.4 + i * 0.2 }}
              >
                {item.value}%
              </motion.span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.value}%` }}
                transition={{ duration: 1, delay: 2.2 + i * 0.2, ease: "easeOut" }}
                className={`h-full ${item.color} rounded-full relative`}
              >
                <motion.div
                  className="absolute inset-0"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ filter: "blur(4px)" }}
                />
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}