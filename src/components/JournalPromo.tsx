import { ArrowRight, BookOpen, Download, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { trackYandexGoal } from "../analytics/yandexMetrika";
import { currentJournalIssue } from "../data/journalIssues";
import { Button } from "./ui/button";

export function JournalPromo() {
  const { t } = useTranslation();
  const issue = currentJournalIssue;

  return (
    <section id="journal" className="relative px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-blue-500/20 bg-gradient-to-br from-blue-600/10 via-card/80 to-cyan-500/10 p-6 shadow-2xl shadow-blue-500/10 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative mx-auto w-full max-w-sm"
            >
              <Link
                to={`/journal/${issue.slug}/`}
                state={{ journalPlacement: "homepage_cover" }}
                className="group block"
                aria-label={t("journal.readIssue")}
              >
                <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-blue-950/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[-0.5deg]">
                  <img
                    src={issue.coverUrl}
                    alt={t("journal.coverAlt")}
                    width="960"
                    height="1358"
                    loading="lazy"
                    decoding="async"
                    className="aspect-[960/1358] h-auto w-full rounded-xl object-cover"
                  />
                </div>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="relative"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-300">
                <Sparkles className="h-4 w-4" />
                {t("journal.promoBadge")}
              </span>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                {t("journal.issueLabel", { issue: issue.issue })}
              </p>
              <h2 className="mt-3 text-4xl font-bold leading-tight text-foreground md:text-6xl">
                {t("journal.issueTitle")}
              </h2>
              <p className="mt-5 max-w-2xl text-xl font-medium text-foreground/90 md:text-2xl">
                {t("journal.issueSubtitle")}
              </p>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {t("journal.issueDescription")}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="border-0 bg-blue-600 text-white hover:bg-blue-700">
                  <Link
                    to={`/journal/${issue.slug}/`}
                    state={{ journalPlacement: "homepage_button" }}
                  >
                    <BookOpen className="h-4 w-4" />
                    {t("journal.readIssue")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a
                    href={issue.pdfUrl}
                    download
                    onClick={() =>
                      trackYandexGoal("journal_download", {
                        issue: issue.issue,
                        placement: "homepage",
                      })
                    }
                  >
                    <Download className="h-4 w-4" />
                    {t("journal.downloadPdf")}
                  </a>
                </Button>
              </div>

              <p className="mt-5 text-sm text-muted-foreground">
                {t("journal.formatMeta", { pages: issue.pages })}
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
