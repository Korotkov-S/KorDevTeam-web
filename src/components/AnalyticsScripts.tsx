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
    if (!restorationReady || decision !== "accepted") {
      setAnalyticsConsent(false);
      return;
    }

    setAnalyticsConsent(true);
    loadYandexMetrika(document);
    loadTopMailRu(document);
  }, [decision, restorationReady]);

  return null;
}
