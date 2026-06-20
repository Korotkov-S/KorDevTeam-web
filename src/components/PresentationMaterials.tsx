import React from "react";
import { motion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  FileText,
  Handshake,
  PlayCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

const VIDEO_URL = "/presentations/kordev-company-showcase-with-voice-music.mp4";
const BUSINESS_PDF_URL = "/presentations/kordev-team-business-presentation.pdf";
const AGENCY_PDF_URL = "/presentations/kordev-team-agency-presentation.pdf";

export function PresentationMaterials() {
  const { t } = useTranslation();

  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  const materials = [
    {
      icon: Building2,
      title: t("presentationMaterials.business.title"),
      description: t("presentationMaterials.business.description"),
      href: BUSINESS_PDF_URL,
    },
    {
      icon: Handshake,
      title: t("presentationMaterials.agency.title"),
      description: t("presentationMaterials.agency.description"),
      href: AGENCY_PDF_URL,
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-14 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card/60 dark:bg-white/5 p-3 shadow-2xl shadow-cyan-500/10">
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
                <video
                  className="h-full w-full object-cover"
                  controls
                  preload="metadata"
                  playsInline
                  aria-label={t("presentationMaterials.videoLabel")}
                >
                  <source src={VIDEO_URL} type="video/mp4" />
                </video>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-300 text-sm">
              <PlayCircle className="w-4 h-4" />
              {t("presentationMaterials.badge")}
            </span>

            <h2 className="mt-6 text-4xl md:text-6xl font-bold text-foreground leading-tight">
              {t("presentationMaterials.title")}
            </h2>

            <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
              {t("presentationMaterials.subtitle")}
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4">
              {materials.map((material) => {
                const Icon = material.icon;

                return (
                  <a
                    key={material.href}
                    href={material.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-border bg-card/60 dark:bg-white/5 px-5 py-4 transition-all duration-300 hover:border-border/70 dark:hover:border-white/20 hover:bg-accent/50 dark:hover:bg-white/10"
                  >
                    <span className="flex items-start gap-4">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-foreground">
                            {material.title}
                          </span>
                          <ArrowDownToLine className="h-5 w-5 shrink-0 text-blue-500 transition-transform group-hover:translate-y-0.5" />
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                          {material.description}
                        </span>
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                onClick={scrollToContact}
                className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              >
                {t("common.freeConsultation")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button asChild variant="outline">
                <a href={BUSINESS_PDF_URL} target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-2" />
                  {t("presentationMaterials.openBusiness")}
                </a>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
