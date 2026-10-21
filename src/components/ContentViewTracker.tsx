import React, { useEffect, useState } from "react";
import { useContentViews } from "../contexts/ContentViewsContext";
import { trackUniqueContentOpen } from "../lib/contentViews/analytics";
import { ViewCount } from "./public/ViewCount";
export function ContentViewTracker({ entryId, onCount }: { entryId: string; onCount: (views: string) => void }) {
  const { enabled, record } = useContentViews();
  useEffect(() => {
    if (!enabled) return;
    let retired = false, started = false;
    const start = () => {
      if (retired || started || document.visibilityState !== "visible" || (document as Document & { prerendering?: boolean }).prerendering) return;
      started = true;
      void record(entryId).then(receipt => {
        if (retired || !receipt || receipt.target.entryId !== entryId) return;
        onCount(receipt.views); trackUniqueContentOpen(receipt);
      }).catch(() => { /* a failed write does not hide the known SSR count */ });
    };
    // Coalesce React's synchronous StrictMode replay before starting any request.
    queueMicrotask(start);
    document.addEventListener("visibilitychange", start); document.addEventListener("prerenderingchange", start);
    return () => { retired = true; document.removeEventListener("visibilitychange", start); document.removeEventListener("prerenderingchange", start); };
  }, [enabled, entryId, record, onCount]);
  return null;
}
export function MaterialViewCount({ entryId, value }: { entryId?: string; value?: string | null }) {
  const [observed, setObserved] = useState(value);
  useEffect(() => setObserved(value), [entryId, value]);
  if (value === undefined) return null;
  return <><ViewCount value={observed ?? null} />{entryId && <ContentViewTracker key={entryId} entryId={entryId} onCount={setObserved} />}</>;
}
