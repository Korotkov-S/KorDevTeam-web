import React from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Bot,
  CalendarCheck,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Button } from "./ui/button";

export function ProductSpotlight() {
  const { t } = useTranslation();
  const features = t("productSpotlight.features", { returnObjects: true }) as string[];
  const icons = [Users, ClipboardList, CalendarCheck, MessageSquare, Bot, Sparkles];

  return (
    <section className="py-24 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.95fr] gap-10 lg:gap-14 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 text-sm">
              <Sparkles className="w-4 h-4" />
              {t("productSpotlight.badge")}
            </span>

            <h2 className="mt-6 text-4xl md:text-6xl font-bold text-foreground leading-tight">
              {t("productSpotlight.title")}
            </h2>

            <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
              {t("productSpotlight.subtitle")}
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feature, index) => {
                const Icon = icons[index % icons.length];
                return (
                  <div
                    key={feature}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card/60 dark:bg-white/5 px-4 py-3"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm text-foreground/90">{feature}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                <a href="https://krasotula.com" target="_blank" rel="noopener noreferrer">
                  {t("productSpotlight.openProduct")}
                  <ArrowUpRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="https://t.me/ideamen51" target="_blank" rel="noopener noreferrer">
                  {t("productSpotlight.requestDemo")}
                </a>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card/60 dark:bg-white/5 p-3 shadow-2xl shadow-blue-500/10">
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                <ImageWithFallback
                  src="/blog/covers/krasotulya-crm-launch.jpg"
                  alt={t("productSpotlight.imageAlt")}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              </div>
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/20 bg-background/80 p-4 backdrop-blur-xl">
                <p className="text-sm font-medium text-foreground">
                  {t("productSpotlight.proofTitle")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("productSpotlight.proofText")}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
