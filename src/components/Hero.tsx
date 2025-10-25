import { Button } from "./ui/button";
import { ArrowRight, Code2 } from "lucide-react";

export function Hero() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-8">
            <Code2 className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">
              Команда профессиональных разработчиков
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl mb-6 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Цифровая трансформация вашего бизнеса
          </h1>

          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Мы специализируемся на разработке веб-сервисов и мобильных
            приложений. От концепции до запуска и поддержки.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => scrollToSection("contact")}
              className="group"
            >
              Обсудить проект
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollToSection("services")}
            >
              Наши услуги
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl md:text-4xl text-primary mb-2">95%</div>
              <div className="text-sm text-muted-foreground">
                клиентов остались довольны
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl text-primary mb-2">30%</div>
              <div className="text-sm text-muted-foreground">
                Дешевле, чем у коллег
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl text-primary mb-2">83%</div>
              <div className="text-sm text-muted-foreground">
                Точно в дедлайн
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
