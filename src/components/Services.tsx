import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { motion } from "motion/react";
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
    <section id="services" className="py-28 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-blue-400 text-sm">
              {t("services.title")}
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            {t("services.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            {t("services.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative"
              >
                <Card className="relative h-full p-0 rounded-2xl overflow-hidden bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300">
                  <CardHeader className="px-8 pt-8">
                    <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-foreground mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                      {service.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-8 pb-8">
                    <CardDescription className="text-muted-foreground leading-relaxed">
                      {service.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
