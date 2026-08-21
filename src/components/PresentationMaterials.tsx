import React, { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
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
  const [videoRequested, setVideoRequested] = useState(false);

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
                {videoRequested ? (
                  <video
                    className="h-full w-full object-cover"
                    controls
                    autoPlay
                    preload="metadata"
                    playsInline
                    aria-label={t("presentationMaterials.videoLabel")}
                  >
                    <source src={VIDEO_URL} type="video/mp4" />
                  </video>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVideoRequested(true)}
                    className="group relative h-full w-full overflow-hidden"
                    aria-label={t("presentationMaterials.videoLabel")}
                  >
                    <img
                      src="/opengraphlogo.jpeg"
                      alt=""
                      width="1200"
                      height="630"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 bg-black/35" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                        <PlayCircle className="h-8 w-8" />
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {materials.map((material) => {
                const Icon = material.icon;

                return (
                  <a
                    key={material.href}
                    href={material.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-border bg-card/60 dark:bg-white/5 px-4 py-3 transition-all duration-300 hover:border-border/70 dark:hover:border-white/20 hover:bg-accent/50 dark:hover:bg-white/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {material.title}
                          </span>
                          <ArrowDownToLine className="h-4 w-4 shrink-0 text-blue-500 transition-transform group-hover:translate-y-0.5" />
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {material.description}
                        </span>
                      </span>
                    </span>
                  </a>
                );
              })}
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

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                onClick={scrollToContact}
                className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              >
                {t("common.freeConsultation")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
