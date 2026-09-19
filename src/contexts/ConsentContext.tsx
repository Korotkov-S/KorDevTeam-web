import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CONSENT_STORAGE_KEY,
  createConsentRecord,
  parseConsentRecord,
  type ConsentDecision,
} from "../lib/consent";

type ConsentContextValue = {
  decision: ConsentDecision;
  restorationReady: boolean;
  dialogOpen: boolean;
  accept: () => void;
  reject: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  settingsOpen: boolean;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [decision, setDecision] = useState<ConsentDecision>("unknown");
  const [restorationReady, setRestorationReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusAfterCloseRef = useRef(false);
  const dialogOpen = settingsOpen || (restorationReady && decision === "unknown");

  const choose = useCallback((nextDecision: Exclude<ConsentDecision, "unknown">) => {
    setDecision(nextDecision);
    setSettingsOpen(false);
    try {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify(createConsentRecord(nextDecision)),
      );
    } catch {
      // The in-memory choice still applies when storage is unavailable.
    }
    restoreFocusAfterCloseRef.current = true;
  }, []);

  const openSettings = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    restoreFocusAfterCloseRef.current = true;
  }, []);

  useEffect(() => {
    let restoredDecision: ConsentDecision = "unknown";
    try {
      restoredDecision = parseConsentRecord(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    } catch {
      restoredDecision = "unknown";
    }
    setDecision(restoredDecision);
    setRestorationReady(true);
  }, []);

  useEffect(() => {
    if (dialogOpen || !restoreFocusAfterCloseRef.current) return;
    restoreFocusAfterCloseRef.current = false;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, [dialogOpen]);

  useEffect(() => {
    window.addEventListener("kordev:open-consent-settings", openSettings);
    return () => window.removeEventListener("kordev:open-consent-settings", openSettings);
  }, [openSettings]);

  return (
    <ConsentContext.Provider value={{
      decision,
      restorationReady,
      dialogOpen,
      accept: () => choose("accepted"),
      reject: () => choose("rejected"),
      openSettings,
      closeSettings,
      settingsOpen,
    }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function ConsentShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { dialogOpen } = useConsent();
  const inertAttribute: Record<string, string> = dialogOpen ? { inert: "" } : {};

  const blockBackgroundInteraction = (event: React.SyntheticEvent) => {
    if (!dialogOpen) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      {...inertAttribute}
      className={className}
      aria-hidden={dialogOpen ? "true" : undefined}
      onClickCapture={blockBackgroundInteraction}
      onPointerDownCapture={blockBackgroundInteraction}
    >
      {children}
    </div>
  );
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) throw new Error("useConsent must be used within ConsentProvider");
  return context;
}
