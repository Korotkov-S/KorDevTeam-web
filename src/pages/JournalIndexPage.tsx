import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { trackYandexGoal } from "../analytics/yandexMetrika";
import { ContentCard } from "../components/public/ContentCard";
import { Section, SectionHeading } from "../components/public/Section";
import { journalIssues } from "../data/journalIssues";

export function JournalIndexPage() {
  const { t } = useTranslation();

  return (
    <Section className="min-h-screen pt-32 lg:pt-36">
      <SectionHeading
        level={1}
        eyebrow={t("journal.archiveBadge")}
        title={t("journal.archiveTitle")}
        description={t("journal.archiveDescription")}
      />

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {journalIssues.map((issue, index) => (
          <div key={issue.slug} className="flex flex-col gap-3">
            <ContentCard
              post={{
                slug: issue.slug,
                title: t("journal.issueTitle"),
                summary: t("journal.issueSubtitle"),
                tags: [t("journal.archiveBadge")],
                image: {
                  id: `journal:${issue.slug}`,
                  src: issue.coverUrl,
                  srcSet: "",
                  sizes: "(min-width: 768px) 33vw, 100vw",
                  alt: t("journal.coverAlt"),
                  decorative: false,
                  width: 960,
                  height: 1358,
                },
              }}
              href={`/journal/${issue.slug}/`}
              actionLabel={t("journal.readIssue")}
              meta={t("journal.issueLabel", { issue: issue.issue })}
              eagerImage={index === 0}
              linkState={{ journalPlacement: "journal_archive_button" }}
              headingLevel={2}
              imageAspectClass="aspect-[960/1358]"
              imageObjectFitClass="object-contain"
            />
            <a
              href={issue.pdfUrl}
              download
              className="inline-flex w-fit items-center gap-2 px-2 py-2 text-sm font-semibold text-[var(--public-blue)] underline underline-offset-4"
              onClick={() => trackYandexGoal("journal_download", { issue: issue.issue, placement: "journal_archive" })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("journal.downloadPdf")}
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}
