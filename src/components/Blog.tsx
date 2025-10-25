import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, Clock, ArrowRight } from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  slug: string;
}

const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "Лучшие практики разработки на React Native в 2025 году",
    excerpt: "React Native продолжает оставаться одним из самых популярных фреймворков для разработки мобильных приложений. В этой статье мы рассмотрим ключевые практики...",
    date: "20 октября 2025",
    readTime: "8 мин",
    tags: ["React Native", "Mobile Development"],
    slug: "react-native-best-practices",
  },
  {
    id: "2",
    title: "Микросервисная архитектура на Node.js с NestJS",
    excerpt: "Микросервисная архитектура позволяет разбить монолитное приложение на небольшие, независимые сервисы, которые легко масштабировать и поддерживать...",
    date: "15 октября 2025",
    readTime: "12 мин",
    tags: ["Node.js", "NestJS", "Microservices"],
    slug: "nodejs-microservices",
  },
  {
    id: "3",
    title: "Оптимизация производительности WordPress сайтов",
    excerpt: "WordPress — одна из самых популярных CMS в мире, но без правильной оптимизации сайты могут работать медленно. В этой статье мы рассмотрим ключевые методы...",
    date: "10 октября 2025",
    readTime: "10 мин",
    tags: ["WordPress", "Optimization", "PHP"],
    slug: "wordpress-optimization",
  },
  {
    id: "4",
    title: "Разработка RESTful API на Laravel: Полное руководство",
    excerpt: "Laravel — один из самых популярных PHP фреймворков для создания веб-приложений и API. В этом руководстве мы создадим полноценный RESTful API...",
    date: "5 октября 2025",
    readTime: "15 мин",
    tags: ["Laravel", "PHP", "API Development"],
    slug: "laravel-api-development",
  },
];

export function Blog() {
  return (
    <section id="blog" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">Блог</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Делимся опытом, знаниями и лучшими практиками в разработке
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {blogPosts.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="block"
            >
              <Card className="bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-pointer group h-full">
                <CardHeader>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>
                  <CardTitle className="group-hover:text-primary transition-colors">
                    {post.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground mb-4">
                    {post.excerpt}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {post.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className="group/btn p-0 h-auto hover:bg-transparent"
                  >
                    <span className="text-primary">Читать далее</span>
                    <ArrowRight className="ml-2 w-4 h-4 text-primary group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
