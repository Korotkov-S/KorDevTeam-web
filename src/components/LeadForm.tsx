import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { cn } from "./ui/utils";
import { track } from "../lib/analytics";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSIENT_STATUSES = new Set([408, 425, 429]);

type FormFields = {
  name: string;
  phone: string;
  description: string;
  consent: boolean;
  website: string;
};

type FormErrors = Partial<Record<"name" | "phone" | "consent", string>>;

type RetrySubmission = {
  key: string;
  snapshot: string;
};

export type LeadFormProps = {
  pagePath?: string;
  className?: string;
};

const emptyFields: FormFields = {
  name: "",
  phone: "",
  description: "",
  consent: false,
  website: "",
};

function normalizeSnapshotText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function submissionSnapshot(fields: FormFields, file: File | null, normalizedPagePath: string): string {
  return JSON.stringify({
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    description: fields.description.trim(),
    consent: fields.consent,
    website: fields.website,
    pagePath: normalizedPagePath,
    file: file
      ? { name: file.name, size: file.size, lastModified: file.lastModified }
      : null,
  });
}

function isTransient(status: number): boolean {
  return TRANSIENT_STATUSES.has(status) || status >= 500;
}

export function LeadForm({ pagePath = "/", className }: LeadFormProps) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const retryRef = useRef<RetrySubmission | null>(null);
  const inFlightRef = useRef(false);
  const openedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => setHydrated(true), []);

  const analyticsPayload = () => ({ path: normalizeSnapshotText(pagePath) });

  const trackOpen = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    track("form_open", analyticsPayload());
  };

  const trackStart = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("form_start", analyticsPayload());
  };

  const edit = <K extends keyof FormFields>(key: K, value: FormFields[K]) => {
    trackStart();
    retryRef.current = null;
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "name" || key === "phone" || key === "consent") {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
    setStatus("");
  };

  const onFileChange = () => {
    trackStart();
    retryRef.current = null;
    setStatus("");
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!fields.name.trim()) next.name = t("contact.form.errors.name");
    if (!fields.phone.trim()) next.phone = t("contact.form.errors.phone");
    if (!fields.consent) next.consent = t("contact.form.errors.consent");
    return next;
  };

  const focusFirstError = (next: FormErrors) => {
    const field = next.name ? "name" : next.phone ? "phone" : next.consent ? "consent" : null;
    if (field) formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (inFlightRef.current) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus(t("contact.form.status.invalid"));
      focusFirstError(nextErrors);
      track("form_submit_error", { ...analyticsPayload(), errorCode: "validation" });
      return;
    }

    const normalizedPagePath = normalizeSnapshotText(pagePath);
    const snapshot = submissionSnapshot(fields, file, normalizedPagePath);
    const submission = retryRef.current?.snapshot === snapshot
      ? retryRef.current
      : { key: crypto.randomUUID(), snapshot };
    retryRef.current = submission;

    const formData = new FormData();
    formData.append("name", fields.name.trim());
    formData.append("phone", fields.phone.trim());
    formData.append("description", fields.description.trim());
    formData.append("consent", "accepted");
    formData.append("website", fields.website);
    formData.append("pagePath", normalizedPagePath);
    if (file) formData.append("file", file, file.name);

    inFlightRef.current = true;
    setPending(true);
    setStatus(t("contact.form.status.sending"));

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Idempotency-Key": submission.key },
        body: formData,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const leadId = body && typeof body === "object" && "leadId" in body
        ? (body as { leadId?: unknown }).leadId
        : undefined;

      if ((response.status === 200 || response.status === 201)
        && typeof leadId === "string"
        && UUID_PATTERN.test(leadId)) {
        retryRef.current = null;
        setFields(emptyFields);
        setFile(null);
        setErrors({});
        form.reset();
        setStatus(t("contact.form.status.success"));
        track("form_submit_success", analyticsPayload());
        return;
      }

      if (!isTransient(response.status)) retryRef.current = null;
      setStatus(t("contact.form.status.error"));
      track("form_submit_error", {
        ...analyticsPayload(),
        errorCode: response.ok ? "invalid_response" : `http_${response.status}`,
      });
    } catch {
      setStatus(t("contact.form.status.error"));
      track("form_submit_error", { ...analyticsPayload(), errorCode: "network" });
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      action="/api/leads"
      method="post"
      encType="multipart/form-data"
      noValidate={hydrated}
      onFocusCapture={trackOpen}
      onSubmit={handleSubmit}
      className={cn("space-y-5", className)}
    >
      <div>
        <label htmlFor="lead-name" className="mb-2 block text-sm font-medium text-foreground">
          {t("contact.form.name")}
        </label>
        <Input
          id="lead-name"
          name="name"
          autoComplete="name"
          required
          value={fields.name}
          onChange={(event) => edit("name", event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "lead-name-error" : undefined}
        />
        {errors.name && <p id="lead-name-error" className="mt-1 text-sm text-destructive">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="lead-phone" className="mb-2 block text-sm font-medium text-foreground">
          {t("contact.form.phone")}
        </label>
        <Input
          id="lead-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          value={fields.phone}
          onChange={(event) => edit("phone", event.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "lead-phone-error" : undefined}
        />
        {errors.phone && <p id="lead-phone-error" className="mt-1 text-sm text-destructive">{errors.phone}</p>}
      </div>

      <div>
        <label htmlFor="lead-description" className="mb-2 block text-sm font-medium text-foreground">
          {t("contact.form.description")}
        </label>
        <Textarea
          id="lead-description"
          name="description"
          rows={5}
          value={fields.description}
          onChange={(event) => edit("description", event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="lead-file" className="mb-2 block text-sm font-medium text-foreground">
          {t("contact.form.file")}
        </label>
        <Input
          id="lead-file"
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          aria-describedby="lead-file-hint"
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            onFileChange();
          }}
        />
        <p id="lead-file-hint" className="mt-1 text-xs text-muted-foreground">{t("contact.form.fileHint")}</p>
      </div>

      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="lead-website">Website</label>
        <input
          id="lead-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          onChange={(event) => edit("website", event.target.value)}
        />
      </div>
      <input type="hidden" name="pagePath" value={pagePath} readOnly />

      <div>
        <div className="flex items-start gap-3">
          <input
            id="lead-consent"
            name="consent"
            type="checkbox"
            value="accepted"
            required
            checked={fields.consent}
            onChange={(event) => edit("consent", event.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "lead-consent-error" : undefined}
            className="mt-1 h-4 w-4 rounded border-input accent-blue-600"
          />
          <label htmlFor="lead-consent" className="text-sm text-muted-foreground">
            {t("contact.form.consentPrefix")}{" "}
            <a href="/privacy/" className="text-blue-600 underline underline-offset-2 dark:text-blue-300">
              {t("contact.form.consentLink")}
            </a>
          </label>
        </div>
        {errors.consent && <p id="lead-consent-error" className="mt-1 text-sm text-destructive">{errors.consent}</p>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          <p>{t("contact.form.responseTime")}</p>
          <p>{t("contact.form.workingHours")}</p>
        </div>
        <Button type="submit" size="lg" disabled={pending} className="border-0 bg-[var(--public-blue)] text-[var(--public-action-foreground)] hover:bg-[var(--public-violet)]">
          {pending ? t("contact.form.submitting") : t("contact.form.submit")}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      <p id="lead-submitted-message" className="hidden text-sm text-[var(--public-green)] target:block">
        Заявка отправлена. Мы свяжемся с вами в течение рабочего дня.
      </p>
      <p id="lead-submit-error" className="hidden text-sm text-destructive target:block">
        Не удалось отправить заявку. Попробуйте ещё раз.
      </p>
    </form>
  );
}
