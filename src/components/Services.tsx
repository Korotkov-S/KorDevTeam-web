import React from "react";
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
import { useTranslation } from "react-i18next";

export function Services() {
  const { t } = useTranslation();

  const services = [
    {
      icon: Globe,
      title: t("services.webDevelopment.title"),
      description: t("services.webDevelopment.description"),
    },
    {
      icon: Smartphone,
      title: t("services.mobileApps.title"),
      description: t("services.mobileApps.description"),
    },
    {
      icon: Server,
      title: t("services.backend.title"),
      description: t("services.backend.description"),
    },
    {
      icon: Database,
      title: t("services.interviews.title"),
      description: t("services.interviews.description"),
    },
    {
      icon: Code,
      title: t("services.cmsSupport.title"),
      description: t("services.cmsSupport.description"),
    },
    {
      icon: Wrench,
      title: t("services.technicalSupport.title"),
      description: t("services.technicalSupport.description"),
    },
  ];

  return (
    <section id="services" className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">{t("services.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("services.subtitle")}
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
