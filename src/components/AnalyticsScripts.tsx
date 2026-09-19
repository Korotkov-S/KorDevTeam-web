import { useEffect } from "react";

import { useConsent } from "../contexts/ConsentContext";
import {
  loadTopMailRu,
  loadYandexMetrika,
  setAnalyticsConsent,
} from "../lib/analytics";

export function AnalyticsScripts(): null {
  const { decision, restorationReady } = useConsent();

  useEffect(() => {
    const ownerDocument = document;
    if (!restorationReady || decision !== "accepted") {
      setAnalyticsConsent(ownerDocument, false);
      return;
    }

    setAnalyticsConsent(ownerDocument, true);
    loadYandexMetrika(ownerDocument);
    loadTopMailRu(ownerDocument);
    return () => setAnalyticsConsent(ownerDocument, false);
  }, [decision, restorationReady]);

  return null;
}
