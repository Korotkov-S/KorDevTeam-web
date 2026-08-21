import { ArrowRight, BookOpen, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { trackYandexGoal } from "../analytics/yandexMetrika";
import { SEO } from "../components/SEO";
import { Button } from "../components/ui/button";
import { journalIssues } from "../data/journalIssues";

export function JournalIndexPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO
        title={t("journal.archiveTitle")}
        description={t("journal.archiveDescription")}
        canonical="https://kordev.team/journal/"
        ogType="website"
        ogImage="https://kordev.team/journal/issue-0-cover.webp"
        ogImageType="image/webp"
        ogImageWidth="960"
        ogImageHeight="1358"
      />
      <div className="min-h-screen px-4 pb-24 pt-32 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <header className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-300">
              <BookOpen className="h-4 w-4" />
              {t("journal.archiveBadge")}
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground md:text-6xl">
              {t("journal.archiveTitle")}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("journal.archiveDescription")}
            </p>
          </header>

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {journalIssues.map((issue) => (
              <article
                key={issue.slug}
                className="overflow-hidden rounded-3xl border border-border bg-card/70 shadow-xl shadow-blue-500/5"
              >
                <Link
                  to={`/journal/${issue.slug}/`}
                  state={{ journalPlacement: "journal_archive_cover" }}
                  className="group block overflow-hidden bg-muted"
                >
                  <img
                    src={issue.coverUrl}
                    alt={t("journal.coverAlt")}
                    width="960"
                    height="1358"
                    className="aspect-[960/1358] h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="eager"
                    decoding="async"
                  />
                </Link>
                <div className="p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-300">
                    {t("journal.issueLabel", { issue: issue.issue })}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold text-foreground">
                    {t("journal.issueTitle")}
                  </h2>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    {t("journal.issueSubtitle")}
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button asChild className="border-0 bg-blue-600 text-white hover:bg-blue-700">
                      <Link
                        to={`/journal/${issue.slug}/`}
                        state={{ journalPlacement: "journal_archive_button" }}
                      >
                        {t("journal.readIssue")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="icon">
                      <a
                        href={issue.pdfUrl}
                        download
                        aria-label={t("journal.downloadPdf")}
                        onClick={() =>
                          trackYandexGoal("journal_download", {
                            issue: issue.issue,
                            placement: "journal_archive",
                          })
                        }
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
