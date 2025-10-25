import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Globe,
  Smartphone,
  Server,
  Wrench,
  Code,
  Database,
} from "lucide-react";

const services = [
  {
    icon: Globe,
    title: "Разработка веб-сервисов",
    description:
      "Создание современных, отзывчивых и производительных веб-сервисов с использованием последних технологий.",
  },
  {
    icon: Smartphone,
    title: "React Native приложения",
    description:
      "Разработка кроссплатформенных мобильных приложений для iOS и Android.",
  },
  {
    icon: Server,
    title: "Backend разработка",
    description:
      "Создание надежных серверных решений на Node.js (NestJS, AdonisJS, Fastify), PHP Laravel и Python.",
  },
  {
    icon: Database,
    title: "Проведение технических собеседований",
    description:
      "Проводим технические собеседования, выдаем подробный отчет и экономим ваши деньги на найме.",
  },
  {
    icon: Code,
    title: "Поддержка WordPress, Drupal",
    description:
      "Полный цикл работы с CMS: от установки и настройки до кастомной разработки и оптимизации.",
  },
  {
    icon: Wrench,
    title: "Техническая поддержка",
    description:
      "Поддержка и обслуживание существующих проектов, исправление ошибок, обновления и улучшения.",
  },
];

export function Services() {
  return (
    <section id="services" className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">Наши услуги</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Предоставляем полный спектр услуг по разработке, внедрению и
            поддержке веб-решений
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <Card
                key={index}
                className="bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    {service.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
