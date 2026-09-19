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
  accept: () => void;
  reject: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  settingsOpen: boolean;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [decision, setDecision] = useState<ConsentDecision>("unknown");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, []);

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
    restoreFocus();
  }, [restoreFocus]);

  const openSettings = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    restoreFocus();
  }, [restoreFocus]);

  useEffect(() => {
    try {
      setDecision(parseConsentRecord(window.localStorage.getItem(CONSENT_STORAGE_KEY)));
    } catch {
      setDecision("unknown");
    }
  }, []);

  useEffect(() => {
    window.addEventListener("kordev:open-consent-settings", openSettings);
    return () => window.removeEventListener("kordev:open-consent-settings", openSettings);
  }, [openSettings]);

  return (
    <ConsentContext.Provider value={{
      decision,
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

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) throw new Error("useConsent must be used within ConsentProvider");
  return context;
}
