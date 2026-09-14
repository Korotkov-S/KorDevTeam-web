import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
  url: "https://kordev.team/",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  HTMLInputElement: dom.window.HTMLInputElement,
  MutationObserver: dom.window.MutationObserver,
  File: dom.window.File,
  FormData: dom.window.FormData,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const require = createRequire(import.meta.url);
const { cleanup, fireEvent, render, screen, waitFor } = require("@testing-library/react");
require("../i18n");
const { LeadForm } = require("./LeadForm");

const VALID_LEAD_ID = "18eaf45c-9f10-4f5d-89b8-8fb514f13549";
const originalFetch = globalThis.fetch;
const originalRandomUUID = globalThis.crypto.randomUUID;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installUuidSequence(...values: `${string}-${string}-${string}-${string}-${string}`[]) {
  let index = 0;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => values[index++] ?? values.at(-1),
  });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Анна" } });
  fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "+7 999 111-22-33" } });
  fireEvent.click(screen.getByLabelText(/согласен/i));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: originalRandomUUID,
  });
});

test("renders labelled native fields with the approved attachment formats", () => {
  render(<LeadForm pagePath="/" />);

  assert.equal(screen.getByLabelText("Имя").getAttribute("name"), "name");
  assert.equal(screen.getByLabelText("Телефон").getAttribute("name"), "phone");
  assert.equal(screen.getByLabelText("Описание задачи (необязательно)").getAttribute("name"), "description");
  assert.equal(screen.getByLabelText("Файл (необязательно)").getAttribute("name"), "file");
  assert.equal(
    screen.getByLabelText("Файл (необязательно)").getAttribute("accept"),
    ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png",
  );
  const fileHint = screen.getByText(/PDF, DOC, DOCX/);
  assert.equal(fileHint.id, "lead-file-hint");
  assert.equal(screen.getByLabelText("Файл (необязательно)").getAttribute("aria-describedby"), fileHint.id);
  assert.equal(screen.getByLabelText(/согласен/i).getAttribute("name"), "consent");
  assert.match(screen.getByText("Ответим в течение рабочего дня").textContent ?? "", /рабочего дня/);
  assert.ok(screen.getByText("Пн–Пт, 09:00–18:00 по Москве"));
  assert.equal(screen.getByRole("link", { name: /обработку персональных данных/i }).getAttribute("href"), "/privacy/");
});

test("reports Russian inline errors and focuses the first invalid field", async () => {
  render(<LeadForm />);

  fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

  assert.equal(document.activeElement, screen.getByLabelText("Имя"));
  assert.equal(screen.getByLabelText("Имя").getAttribute("aria-invalid"), "true");
  assert.ok(screen.getByText("Укажите имя"));
  assert.ok(screen.getByText("Укажите телефон"));
  assert.ok(screen.getByText("Подтвердите согласие на обработку данных"));
  assert.match(screen.getByRole("status").textContent ?? "", /проверьте поля/i);
});

test("submits from the native keyboard form path as multipart without a Content-Type header", async () => {
  let capturedBody: FormData | undefined;
  let capturedHeaders: HeadersInit | undefined;
  installUuidSequence("10000000-0000-4000-8000-000000000001");
  globalThis.fetch = async (_input, init) => {
    capturedBody = init?.body as FormData;
    capturedHeaders = init?.headers;
    return jsonResponse(201, { leadId: VALID_LEAD_ID });
  };
  render(<LeadForm pagePath="/services/automation/" />);
  fillRequiredFields();

  const phone = screen.getByLabelText("Телефон");
  fireEvent.keyDown(phone, { key: "Enter", code: "Enter" });
  fireEvent.submit(phone.closest("form")!);
  await screen.findByText("Заявка отправлена");

  assert.ok(capturedBody instanceof FormData);
  assert.deepEqual([...capturedBody.keys()].sort(), [
    "consent",
    "description",
    "name",
    "pagePath",
    "phone",
    "website",
  ]);
  assert.equal(capturedBody.get("name"), "Анна");
  assert.equal(capturedBody.get("pagePath"), "/services/automation/");
  const headers = new Headers(capturedHeaders);
  assert.equal(headers.get("Content-Type"), null);
  assert.equal(headers.get("Idempotency-Key"), "10000000-0000-4000-8000-000000000001");
});

test("allows only one in-flight request and re-enables submit after a network error", async () => {
  let resolveRequest!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  };
  render(<LeadForm />);
  fillRequiredFields();
  const button = screen.getByRole("button", { name: "Отправить заявку" });

  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(calls, 1);
  assert.equal((button as HTMLButtonElement).disabled, true);

  resolveRequest(new Response(null, { status: 503 }));
  await screen.findByText("Не удалось отправить заявку. Попробуйте ещё раз.");
  assert.equal((button as HTMLButtonElement).disabled, false);
});

test("reuses an idempotency key only for an unchanged retry and resets it after editing", async () => {
  const keys: string[] = [];
  installUuidSequence(
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  );
  globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    throw new TypeError("network unavailable");
  };
  render(<LeadForm />);
  fillRequiredFields();
  const button = screen.getByRole("button", { name: "Отправить заявку" });

  fireEvent.click(button);
  await screen.findByText("Не удалось отправить заявку. Попробуйте ещё раз.");
  fireEvent.click(button);
  await waitFor(() => assert.equal(keys.length, 2));
  assert.equal(keys[0], keys[1]);

  fireEvent.change(screen.getByLabelText("Описание задачи (необязательно)"), { target: { value: "Новый сайт" } });
  fireEvent.click(button);
  await waitFor(() => assert.equal(keys.length, 3));
  assert.notEqual(keys[2], keys[1]);
});

test("uses a new idempotency key when normalized pagePath changes between retries", async () => {
  const attempts: Array<{ key: string; pagePath: FormDataEntryValue | null }> = [];
  installUuidSequence(
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  );
  globalThis.fetch = async (_input, init) => {
    const body = init?.body as FormData;
    attempts.push({
      key: new Headers(init?.headers).get("Idempotency-Key") ?? "",
      pagePath: body.get("pagePath"),
    });
    throw new TypeError("network unavailable");
  };
  const view = render(<LeadForm pagePath="/services/old/" />);
  fillRequiredFields();
  const button = screen.getByRole("button", { name: "Отправить заявку" });

  fireEvent.click(button);
  await screen.findByText("Не удалось отправить заявку. Попробуйте ещё раз.");
  view.rerender(<LeadForm pagePath="/services/new/" />);
  fireEvent.click(button);
  await waitFor(() => assert.equal(attempts.length, 2));

  assert.equal(attempts[0].pagePath, "/services/old/");
  assert.equal(attempts[1].pagePath, "/services/new/");
  assert.notEqual(attempts[0].key, attempts[1].key);
});

test("uses a new idempotency key after file changes and after a successful submission", async () => {
  const keys: string[] = [];
  installUuidSequence(
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
  );
  let shouldSucceed = false;
  globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    if (!shouldSucceed) throw new TypeError("network unavailable");
    return jsonResponse(200, { leadId: VALID_LEAD_ID });
  };
  render(<LeadForm />);
  fillRequiredFields();
  const fileInput = screen.getByLabelText("Файл (необязательно)");
  const button = screen.getByRole("button", { name: "Отправить заявку" });

  fireEvent.click(button);
  await screen.findByText("Не удалось отправить заявку. Попробуйте ещё раз.");
  fireEvent.change(fileInput, {
    target: { files: [new File(["pdf"], "brief.pdf", { type: "application/pdf", lastModified: 10 })] },
  });
  shouldSucceed = true;
  fireEvent.click(button);
  await screen.findByText("Заявка отправлена");
  assert.notEqual(keys[0], keys[1]);

  fillRequiredFields();
  fireEvent.click(button);
  await waitFor(() => assert.equal(keys.length, 3));
  assert.notEqual(keys[1], keys[2]);
});

test("treats only 200 or 201 with a UUID leadId as success", async () => {
  const cases = [
    jsonResponse(202, { leadId: VALID_LEAD_ID }),
    jsonResponse(201, { leadId: "not-a-uuid" }),
    jsonResponse(400, { error: "validation_error" }),
  ];

  for (const response of cases) {
    globalThis.fetch = async () => response;
    const view = render(<LeadForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    assert.ok(await screen.findByText("Не удалось отправить заявку. Попробуйте ещё раз."));
    assert.equal(screen.queryByText("Заявка отправлена"), null);
    view.unmount();
  }
});
