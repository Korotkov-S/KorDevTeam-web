export type JournalIssue = {
  issue: string;
  slug: string;
  publishedAt: string;
  pages: number;
  coverUrl: string;
  pdfUrl: string;
};

export const journalIssues: JournalIssue[] = [
  {
    issue: "0",
    slug: "issue-0",
    publishedAt: "2026-08-01",
    pages: 39,
    coverUrl: "/journal/issue-0-cover.webp",
    pdfUrl: "/journal/kordevteam-issue-0-ai-small-business.pdf",
  },
];

export const currentJournalIssue = journalIssues[0];
