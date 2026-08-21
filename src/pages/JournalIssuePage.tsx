import { ArrowLeft, BookOpen, Download, ExternalLink, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { trackYandexGoal } from "../analytics/yandexMetrika";
import { SEO } from "../components/SEO";
import { Button } from "../components/ui/button";
import { currentJournalIssue } from "../data/journalIssues";

type JournalLocationState = {
  journalPlacement?: string;
};

export function JournalIssuePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [viewerRequested, setViewerRequested] = useState(false);
  const openTracked = useRef(false);
  const issue = currentJournalIssue;
  const placement =
    (location.state as JournalLocationState | null)?.journalPlacement || "direct";

  useEffect(() => {
    if (openTracked.current) return;
    openTracked.current = true;
    trackYandexGoal("journal_issue_open", {
      issue: issue.issue,
      placement,
    });
  }, [issue.issue, placement]);

  useEffect(() => {
    if (!viewerRequested) return;
    window.requestAnimationFrame(() => {
      document.getElementById("journal-viewer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [viewerRequested]);

  const startReading = () => {
    if (!viewerRequested) {
      trackYandexGoal("journal_read_start", {
        issue: issue.issue,
        placement: "issue_page",
      });
    }
    setViewerRequested(true);
  };

  return (
    <>
      <SEO
        title={t("journal.seoIssueTitle")}
        description={t("journal.issueDescription")}
        canonical={`https://kordev.team/journal/${issue.slug}/`}
        ogType="article"
        ogImage={`https://kordev.team${issue.coverUrl}`}
        ogImageType="image/webp"
        ogImageWidth="960"
        ogImageHeight="1358"
      />
      <article className="min-h-screen px-4 pb-24 pt-28 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Link
            to="/journal/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("journal.allIssues")}
          </Link>

          <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[0.68fr_1.32fr] lg:gap-16">
            <div className="mx-auto w-full max-w-md lg:sticky lg:top-28">
              <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-blue-950/20">
                <img
                  src={issue.coverUrl}
                  alt={t("journal.coverAlt")}
                  width="960"
                  height="1358"
                  fetchPriority="high"
                  decoding="async"
                  className="aspect-[960/1358] h-auto w-full rounded-xl object-cover"
                />
              </div>
            </div>

            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-300">
                <BookOpen className="h-4 w-4" />
                {t("journal.issueLabel", { issue: issue.issue })}
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground md:text-6xl">
                {t("journal.issueTitle")}
              </h1>
              <p className="mt-5 text-xl font-medium text-foreground/90 md:text-2xl">
                {t("journal.issueSubtitle")}
              </p>
              <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                {t("journal.issueDescription")}
              </p>

              <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(t("journal.topics", { returnObjects: true }) as string[]).map((topic) => (
                  <li
                    key={topic}
                    className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground/90"
                  >
                    {topic}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  size="lg"
                  onClick={startReading}
                  className="border-0 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <BookOpen className="h-4 w-4" />
                  {viewerRequested ? t("journal.goToViewer") : t("journal.readOnline")}
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a
                    href={issue.pdfUrl}
                    download
                    onClick={() =>
                      trackYandexGoal("journal_download", {
                        issue: issue.issue,
                        placement: "issue_page",
                      })
                    }
                  >
                    <Download className="h-4 w-4" />
                    {t("journal.downloadPdf")}
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("journal.formatMeta", { pages: issue.pages })}
              </p>
            </div>
          </div>

          <section id="journal-viewer" className="mt-16 scroll-mt-28">
            {viewerRequested ? (
              <div className="overflow-hidden rounded-3xl border border-border bg-card/70 p-3 shadow-2xl shadow-blue-500/5 sm:p-5">
                <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {t("journal.viewerTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("journal.viewerHint")}
                    </p>
                  </div>
                  <a
                    href={`${issue.pdfUrl}#view=FitH`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-300"
                  >
                    {t("journal.openNewTab")}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <iframe
                  src={`${issue.pdfUrl}#view=FitH&toolbar=1`}
                  title={t("journal.viewerTitle")}
                  loading="lazy"
                  className="h-[72vh] min-h-[560px] w-full rounded-2xl bg-white"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={startReading}
                className="group flex min-h-72 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-blue-500/30 bg-blue-500/5 px-6 text-center transition-colors hover:bg-blue-500/10"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white transition-transform group-hover:scale-105">
                  <BookOpen className="h-6 w-6" />
                </span>
                <span className="mt-5 text-xl font-semibold text-foreground">
                  {t("journal.viewerPromptTitle")}
                </span>
                <span className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {t("journal.viewerPromptText")}
                </span>
              </button>
            )}
          </section>

          <aside className="mt-16 rounded-3xl border border-border bg-gradient-to-r from-blue-600/10 to-cyan-500/10 p-7 sm:p-10">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              {t("journal.contactTitle")}
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
              {t("journal.contactText")}
            </p>
            <Button asChild className="mt-6 border-0 bg-blue-600 text-white hover:bg-blue-700">
              <a
                href="https://telegram.me/ideamen51"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackYandexGoal("journal_contact", {
                    issue: issue.issue,
                    placement: "issue_page",
                  })
                }
              >
                <MessageCircle className="h-4 w-4" />
                {t("journal.contactButton")}
              </a>
            </Button>
          </aside>
        </div>
      </article>
    </>
  );
}
