import { useEffect } from "react";

import { useConsent } from "../contexts/ConsentContext";
import { readStoredConsent } from "../lib/consent";
import {
  loadTopMailRu,
  loadYandexMetrika,
  setAnalyticsConsent,
  trackPublicPageView,
} from "../lib/analytics";

const owners = new WeakMap<Document, symbol>();

export function AnalyticsScripts({ path }: { path?: string } = {}): null {
  const { decision, restorationReady } = useConsent();

  useEffect(() => {
    const ownerDocument = document;
    const owner = Symbol("analytics-owner"); owners.set(ownerDocument, owner);
    if (!restorationReady || decision !== "accepted") {
      setAnalyticsConsent(ownerDocument, false);
      return;
    }

    setAnalyticsConsent(ownerDocument, true);
    loadYandexMetrika(ownerDocument);
    loadTopMailRu(ownerDocument);
    // React StrictMode replays effects synchronously; don't reinitialize either vendor.
    return () => queueMicrotask(() => { if (owners.get(ownerDocument) === owner) { owners.delete(ownerDocument); setAnalyticsConsent(ownerDocument, false); } });
  }, [decision, restorationReady]);

  useEffect(() => {
    if (restorationReady && decision === "accepted") trackPublicPageView({ path: path ?? window.location.pathname });
  }, [path, decision, restorationReady]);

  useEffect(() => {
    if (!restorationReady || decision !== "accepted") return;
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (readStoredConsent() !== "accepted") { setAnalyticsConsent(document, false); return; }
      trackPublicPageView({ path: window.location.pathname, restored: true });
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [decision, restorationReady]);

  return null;
}
