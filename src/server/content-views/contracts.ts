export type ViewTarget = { entryId: string; kind: "article" | "case"; slug: string; path: string };
export type ViewReceipt = { counted: boolean; views: string; target: ViewTarget };

export class ContentViewError extends Error {
  constructor(public readonly code: "session_expired" | "target_unavailable") { super(code); }
}
