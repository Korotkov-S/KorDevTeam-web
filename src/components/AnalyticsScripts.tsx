import { useEffect, useRef } from "react";

import { useConsent } from "../contexts/ConsentContext";
import {
  loadTopMailRu,
  loadYandexMetrika,
  setAnalyticsConsent,
  trackPublicPageView,
} from "../lib/analytics";

export function AnalyticsScripts({ path }: { path?: string } = {}): null {
  const { decision, restorationReady } = useConsent();
  const epoch = useRef(0);

  useEffect(() => {
    const ownerDocument = document;
    const generation = ++epoch.current;
    if (!restorationReady || decision !== "accepted") {
      setAnalyticsConsent(ownerDocument, false);
      return;
    }

    setAnalyticsConsent(ownerDocument, true);
    loadYandexMetrika(ownerDocument);
    loadTopMailRu(ownerDocument);
    // React StrictMode replays effects synchronously; don't reinitialize either vendor.
    return () => queueMicrotask(() => { if (epoch.current === generation) setAnalyticsConsent(ownerDocument, false); });
  }, [decision, restorationReady]);

  useEffect(() => {
    if (restorationReady && decision === "accepted") trackPublicPageView({ path: path ?? window.location.pathname });
  }, [path, decision, restorationReady]);

  return null;
}
