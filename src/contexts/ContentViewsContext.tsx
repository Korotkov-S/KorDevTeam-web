import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useConsent } from "./ConsentContext";
import { CONSENT_STORAGE_KEY, parseConsentRecord } from "../lib/consent";
import { createViewSessionStore } from "../lib/contentViews/sessionStore";
import { createContentViewsController, createViewTransport } from "../lib/contentViews/controller";
import type { ViewReceipt } from "../lib/contentViews/contracts";

type Context = { enabled: boolean; record: (entryId: string) => Promise<ViewReceipt | null> };
export const ContentViewsContext = createContext<Context>({ enabled: false, record: async () => null });
const visible = () => document.visibilityState === "visible" && !(document as Document & { prerendering?: boolean }).prerendering;
export function ContentViewsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const { decision, restorationReady } = useConsent(); const location = useLocation();
  const store = useMemo(() => createViewSessionStore(), []);
  const allowed = useRef(false); allowed.current = enabled && restorationReady && decision === "accepted";
  const [controller, setController] = useState<ReturnType<typeof createContentViewsController> | null>(null);
  useEffect(() => {
    if (!enabled || !restorationReady) return;
    if (decision !== "accepted") { void store.clear(); setController(null); return; }
    const current = createContentViewsController({ store, transport: createViewTransport(), clock: Date.now, isConsentCurrent: () => allowed.current });
    setController(current);
    if (visible()) void current.activate();
    const activity = (event: Event) => { if (event.isTrusted && visible()) current.activity(); };
    const revoke = (event: StorageEvent) => {
      if ((event.key === CONSENT_STORAGE_KEY || event.key === null) && parseConsentRecord(event.newValue) !== "accepted") {
        allowed.current = false; current.dispose(); void store.clear();
      }
    };
    window.addEventListener("pointerdown", activity, { passive: true }); window.addEventListener("keydown", activity);
    window.addEventListener("storage", revoke);
    return () => { current.dispose(); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); window.removeEventListener("storage", revoke); };
  }, [enabled, restorationReady, decision, store]);
  useEffect(() => { if (controller && visible()) controller.activity(); }, [controller, location.key]);
  const record = useCallback(async (id: string) => visible() && allowed.current && controller ? controller.record(id) : null, [controller]);
  return <ContentViewsContext.Provider value={{ enabled, record }}>{children}</ContentViewsContext.Provider>;
}
export const useContentViews = () => useContext(ContentViewsContext);
