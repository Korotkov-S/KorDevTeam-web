import React, { type ReactNode } from "react";

/** Identity comes from the same published DB entry used by the server presenter, never its payload. */
export function PublishedContentIdentity({ id, version, children }: { id: string; version: number; children: ReactNode }) {
  return <div data-kordev-content-entry-id={id} data-kordev-content-version={version}>{children}</div>;
}
