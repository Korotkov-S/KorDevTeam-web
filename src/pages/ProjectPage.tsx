import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";

// Расширенные данные проектов
const projects = [
  {
    id: "ecommerce-platform",
    title: "E-commerce платформа",
    description:
      "Полнофункциональная платформа для онлайн-торговли с административной панелью и интеграцией платежных систем.",
    fullDescription:
      "Современная e-commerce платформа, разработанная с использованием React и Node.js. Включает в себя полный цикл онлайн-торговли: от каталога товаров до обработки заказов и интеграции с платежными системами. Административная панель позволяет управлять товарами, заказами, клиентами и аналитикой продаж.",
    image:
      "https://images.unsplash.com/photo-1627599936744-51d288f89af4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3ZWIlMjBkZXZlbG9wbWVudCUyMHRlYW18ZW58MXx8fHwxNzYxMzI4Nzk3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    technologies: ["React", "Node.js", "PostgreSQL", "Stripe"],
    features: [
      "Каталог товаров с фильтрацией и поиском",
      "Корзина покупок и оформление заказов",
      "Интеграция с платежными системами",
      "Административная панель",
      "Система уведомлений",
      "Аналитика продаж",
    ],
    demoUrl: "#",
    githubUrl: "#",
  },
  {
    id: "delivery-app",
    title: "Мобильное приложение для доставки",
    description:
      "React Native приложение для сервиса доставки еды с отслеживанием заказов в реальном времени.",
    fullDescription:
      "Мобильное приложение для сервиса доставки еды, разработанное на React Native. Позволяет пользователям заказывать еду, отслеживать статус заказа в реальном времени и получать уведомления о готовности. Включает геолокацию, интеграцию с картами и систему рейтингов.",
    image:
      "https://images.unsplash.com/photo-1618761714954-0b8cd0026356?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2JpbGUlMjBhcHAlMjBpbnRlcmZhY2V8ZW58MXx8fHwxNzYxMzUyMTg3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    technologies: ["React Native", "NestJS", "MongoDB", "Socket.io"],
    features: [
      "Заказ еды с каталогом ресторанов",
      "Отслеживание заказа в реальном времени",
      "Геолокация и карты",
      "Push-уведомления",
      "Система рейтингов и отзывов",
      "Интеграция с платежными системами",
    ],
    demoUrl: "#",
    githubUrl: "#",
  },
  {
    id: "corporate-portal",
    title: "Корпоративный портал",
    description:
      "Веб-платформа для управления проектами и взаимодействия команды с расширенной аналитикой.",
    fullDescription:
      "Корпоративный портал для управления проектами и командной работы. Разработан с использованием Next.js и Laravel. Включает систему управления задачами, календарь проектов, чат для команды, файловое хранилище и расширенную аналитику производительности.",
    image:
      "https://images.unsplash.com/photo-1669062897193-f8a4215c2033?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjB3ZWIlMjBkZXNpZ258ZW58MXx8fHwxNzYxMzUzMDU1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    technologies: ["Next.js", "Laravel", "MySQL", "Redis"],
    features: [
      "Управление проектами и задачами",
      "Календарь и планирование",
      "Командный чат и уведомления",
      "Файловое хранилище",
      "Аналитика и отчеты",
      "Система ролей и прав доступа",
    ],
    demoUrl: "#",
    githubUrl: "#",
  },
];

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const project = projects.find((p) => p.id === projectId);

  // Автоматический скролл наверх при загрузке страницы
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [projectId]);

  if (!project) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Проект не найден</h1>
          <Button onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться на главную
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к главной
          </Button>
        </div>

        <article className="max-w-4xl mx-auto">
          {/* Project Header */}
          <header className="mb-12 pb-8 border-b border-border">
            <h1 className="text-4xl md:text-5xl mb-6">{project.title}</h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              {project.description}
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Изображение */}
            <div className="space-y-4">
              <div className="aspect-video rounded-lg overflow-hidden">
                <ImageWithFallback
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-4">
                <Button asChild className="flex-1">
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Демо
                  </a>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    GitHub
                  </a>
                </Button>
              </div>
            </div>

            {/* Описание */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    Описание проекта
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {project.fullDescription}
                  </p>
                </CardContent>
              </Card>

              {/* Технологии */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    Использованные технологии
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {project.technologies.map((tech, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="border-primary/30 text-primary"
                      >
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Функциональность */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    Основные функции
                  </h3>
                  <ul className="space-y-2">
                    {project.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Back to Projects Button */}
          <div className="mt-12 pt-8 border-t border-border">
            <Button onClick={() => navigate("/#projects")} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Вернуться к проектам
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
