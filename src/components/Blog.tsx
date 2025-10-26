import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  slug: string;
}

export function Blog() {
  const { t } = useTranslation();

  const blogPosts: BlogPost[] = [
    {
      id: "1",
      title: t("blog.posts.reactNative.title"),
      excerpt: t("blog.posts.reactNative.excerpt"),
      date: "20 октября 2025",
      readTime: "8 мин",
      tags: ["React Native", "Mobile Development"],
      slug: "react-native-best-practices",
    },
    {
      id: "2",
      title: t("blog.posts.microservices.title"),
      excerpt: t("blog.posts.microservices.excerpt"),
      date: "15 октября 2025",
      readTime: "12 мин",
      tags: ["Node.js", "NestJS", "Microservices"],
      slug: "nodejs-microservices",
    },
    {
      id: "3",
      title: t("blog.posts.wordpress.title"),
      excerpt: t("blog.posts.wordpress.excerpt"),
      date: "10 октября 2025",
      readTime: "10 мин",
      tags: ["WordPress", "Optimization", "PHP"],
      slug: "wordpress-optimization",
    },
    {
      id: "4",
      title: t("blog.posts.laravel.title"),
      excerpt: t("blog.posts.laravel.excerpt"),
      date: "5 октября 2025",
      readTime: "15 мин",
      tags: ["Laravel", "PHP", "API Development"],
      slug: "laravel-api-development",
    },
  ];

  return (
    <section id="blog" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">{t("blog.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("blog.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {blogPosts.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="block">
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
                    <span className="text-primary">{t("blog.readMore")}</span>
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
