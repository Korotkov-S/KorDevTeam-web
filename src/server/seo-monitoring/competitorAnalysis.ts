import { load } from "cheerio";
import type { AnyNode } from "domhandler";

import { snapshotExcerpt } from "./snapshotText";
import type { SerpResult } from "./providers/yandexSearch";

export type RankSerp = {
  queryText: string;
  targetPath: string | null;
  results: SerpResult[];
};

export type CompetitorSnapshot = RankSerp & {
  id: string;
  queryId: string;
  checkDate: string;
  checkedAt: string;
  regionName: string;
  region: number;
  device: "desktop" | "mobile";
  source: "weekly" | "archive";
  status: "found" | "not_found";
  position: number | null;
  resultLimit: number;
};

export type PageKind = "service" | "article" | "case" | "aggregator" | "home" | "unknown";
type Evidence = { status: "observed"; excerpt: string } | { status: "not_observed"; excerpt?: never };

export type CompetitorPage = {
  url: string;
  finalUrl?: string;
  checkedAt: string;
  status: "checked" | "unavailable";
  title: string;
  facts: Record<string, Evidence>;
};

export type CompetitorFinding = {
  factorId: string;
  observed: number;
  checked: number;
};

export type CompetitorReport = {
  schemaVersion: 1;
  snapshot: CompetitorSnapshot;
  pages: CompetitorPage[];
  findings: CompetitorFinding[];
};

type CompetitorAnalysisNote = {
  factorId: string;
  positions: number[];
  text: string;
  nextStep?: string;
};

type CompetitorAnalysisEvidence = Evidence & { position: number; url: string; checkedAt: string };

export type CompetitorAiAnalysis = {
  savedAt: string;
  summary: string;
  insights: (CompetitorAnalysisNote & { evidence: CompetitorAnalysisEvidence[] })[];
  limitations: string[];
};

export function competitorReportHref(id: string) {
  return "/admin/seo/competitors/?" + new URLSearchParams({ report: id });
}

type PageContent = {
  title: string;
  description: string;
  headings: string[];
  h1: string[];
  blocks: string[];
  opening: string;
  links: Array<{ url: string; text: string }>;
  forms: string[];
  jsonLd: string[];
  imageAlt: string[];
};

type Factor = {
  id: string;
  group: string;
  label: string;
  read: (content: PageContent) => string | undefined;
  proposal?: string;
};

const compact = (s: string) => s.replace(/\s+/gu, " ").trim();
function match(values: string[], expression: RegExp) {
  for (const value of values) {
    const found = expression.exec(value);
    if (found) {
      const start = Math.max(0, Math.min(found.index - 40, value.length - 300));
      return value.slice(start, start + 300);
    }
  }
}
const text = (expression: RegExp) => (p: PageContent) => match(p.blocks, expression);
const heading = (expression: RegExp) => (p: PageContent) => match(p.headings, expression);
const link = (expression: RegExp) => (p: PageContent) => {
  for (const item of p.links) {
    const evidence = match([item.text, item.url], expression);
    if (evidence) return evidence;
  }
};

const priceAmount = String.raw`\d{1,9}(?: \d{3}){0,3}(?:[,.]\d{1,2})?`;
const pricePattern = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${priceAmount} ?[–—-] ?)?${priceAmount} ?(?:тыс\.? ?|млн\.? ?)?(?:₽|руб(?:лей|ля|\.)?|RUB)`,
  "iu",
);
const openingPrice = (page: PageContent) => page.opening.match(pricePattern)?.[0];
const durationPattern = /(?<![\p{L}\p{N}])\d{1,3}(?:\s*[–—-]\s*\d{1,3})?\s*(?:рабоч(?:ий|их|ие)\s+)?(?:день|дн(?:я|ей)|недел[ьяию]|месяц(?:а|ев)?)(?!\p{L})/iu;
const offer = "Предложение";
const cost = "Бюджет и сроки";
const implementation = "Разработка и внедрение";
const proof = "Опыт и доверие";
const contact = "Контакты и заявка";
const content = "Контент и структура";
const technical = "Технические признаки";

export const serviceFactors: readonly Factor[] = [
  { id: "h1", group: offer, label: "Название услуги в H1", read: p => p.h1.join(" · ") },
  { id: "audience", group: offer, label: "Кому подходит услуга", read: heading(/кому|для кого|когда (?:нужн|подход|имеет смысл)/iu), proposal: "Показать, каким компаниям и процессам подходит услуга." },
  { id: "scope", group: offer, label: "Состав услуги", read: heading(/что входит|состав работ|какие (?:системы|решения|CRM)|функциональност/iu), proposal: "Указать конкретные работы и границы первого этапа." },
  { id: "outcome", group: offer, label: "Результат для заказчика", read: heading(/что получ|результат|что да[её]т/iu), proposal: "Описать результат, который заказчик сможет проверить при приёмке." },
  { id: "alternatives", group: offer, label: "Сравнение подходов", read: matchApproaches, proposal: "Объяснить, когда достаточно готового решения, а когда нужна разработка." },
  { id: "price", group: cost, label: "Сумма в рублях", read: p => match(p.blocks, pricePattern) ?? openingPrice(p), proposal: "Сделать видимым подтверждённый ориентир бюджета и объяснить, к какому объёму работ он относится." },
  { id: "opening_price", group: cost, label: "Цена в начале основной части", read: openingPrice, proposal: "Проверить размещение подтверждённого ориентира цены ближе к началу страницы и подписать единицу расчёта." },
  { id: "price_basis", group: cost, label: "Что влияет на цену", read: text(/(?:цен[аыу]|стоимость|бюджет).{0,80}(?:зависит|складывается|включает)|(?:зависит|складывается).{0,60}(?:цена|стоимость)/iu), proposal: "Указать, какие параметры проекта меняют стоимость." },
  { id: "estimate", group: cost, label: "Как получить оценку", read: text(/(?:получить|подготовим|запросить|рассчитаем).{0,65}(?:смету|стоимость|оценку|коммерческое предложение)/iu) },
  { id: "timing", group: cost, label: "Числовой ориентир по срокам", read: text(durationPattern), proposal: "Уточнить срок первого результата и условия, от которых он зависит." },
  { id: "payment", group: cost, label: "Условия оплаты работ", read: text(/предоплат|оплата по этапам|безналич|оплата по сч[её]ту/iu) },
  { id: "stages", group: implementation, label: "Этапы работ", read: heading(/этапы|как мы работаем|процесс разработки|план запуска/iu), proposal: "Описать этапы от обследования до передачи результата." },
  { id: "integrations", group: implementation, label: "Интеграции и обмен данными", read: text(/интеграц.{0,60}(?:1С|ERP|API|Битрикс|уч[её]т|данн)|обмен данными/iu) },
  { id: "migration", group: implementation, label: "Перенос данных", read: text(/(?:перенос|миграци)[а-яё]* данных/iu) },
  { id: "handover", group: implementation, label: "Передача кода, документации и доступов", read: text(/исходн.{0,8} код|переда[её]м.{0,80}(?:доступ|документ)|документаци.{0,60}(?:переда|доступ)/iu) },
  { id: "support", group: implementation, label: "Сопровождение после запуска", read: text(/после (?:запуска|внедрения).{0,100}(?:поддерж|сопровож)|(?:поддерж|сопровож).{0,60}после (?:запуска|внедрения)/iu) },
  { id: "cases", group: proof, label: "Кейсы и примеры работ", read: heading(/кейс|портфолио|реализованные проекты|примеры работ/iu), proposal: "Подкрепить услугу сопоставимыми кейсами с описанием задачи и результата." },
  { id: "case_links", group: proof, label: "Ссылки на кейсы", read: link(/\/(?:cases|case|portfolio|projects)\/[^?#/]+/iu) },
  { id: "reviews", group: proof, label: "Отзывы клиентов", read: heading(/отзывы|что говорят клиенты/iu) },
  { id: "team", group: proof, label: "Команда или ответственный за проект", read: heading(/команда|кто будет работать|руководител|эксперт/iu) },
  { id: "company", group: proof, label: "Данные о компании и реквизиты", read: link(/реквизит|\/requisites|о компании|\/about/iu) },
  { id: "security", group: proof, label: "Безопасность и права доступа", read: text(/ролевая модель|права доступа|защит[аыу] данных|резервн.{0,10} копи/iu) },
  { id: "phone", group: contact, label: "Кликабельный телефон", read: link(/^tel:/iu) },
  { id: "email", group: contact, label: "Кликабельная почта", read: link(/^mailto:/iu) },
  { id: "messenger", group: contact, label: "Контакт в мессенджере", read: link(/(?:t\.me|wa\.me|api\.whatsapp\.com|max\.ru)\//iu) },
  { id: "office", group: contact, label: "Карта или схема проезда", read: link(/(?:yandex\.[^/]+\/maps|yandex\.ru\/map-widget|maps\.google|2gis\.[^/]+\/)/iu) },
  { id: "form", group: contact, label: "Поля заявки", read: p => p.forms[0] },
  { id: "cta", group: contact, label: "Действие для начала проекта", read: p => match(p.links.map(x => x.text), /обсудить|оставить заявку|заказать|связаться|получить (?:оценку|тз)/iu) },
  { id: "next_step", group: contact, label: "Что произойдёт после заявки", read: text(/после (?:заявки|отправки|встречи).{0,120}|(?:свяжемся|ответим) (?:в течение|за)/iu), proposal: "Пояснить, кто свяжется после заявки и что заказчик получит на первом шаге." },
  { id: "privacy", group: contact, label: "Ссылка на политику конфиденциальности", read: link(/privacy|конфиденциальност|обработк[аи] персональных данных/iu) },
  { id: "faq", group: content, label: "Ответы на частые вопросы", read: heading(/faq|част(?:ые|о задаваемые) вопрос/iu) },
  { id: "blog", group: content, label: "Ссылки на материалы по теме", read: link(/\/(?:blog|articles|journal)\/[^?#/]+/iu) },
  { id: "headings", group: technical, label: "Иерархия заголовков", read: p => p.headings.slice(0, 5).join(" · ") },
  { id: "title", group: technical, label: "Title", read: p => p.title },
  { id: "description", group: technical, label: "Meta description", read: p => p.description },
  { id: "alt", group: technical, label: "Текстовые описания изображений", read: p => p.imageAlt[0] },
  { id: "schema", group: technical, label: "Типы разметки JSON-LD", read: p => p.jsonLd.join(" · ") },
];

function matchApproaches(p: PageContent) {
  return match(p.blocks, /(?:коробочн|готов).{0,100}(?:сво[яю]|собственн|индивидуальн)|(?:сво[яю]|собственн|индивидуальн).{0,100}(?:коробочн|готов)/iu);
}

export function classifyResult(result: SerpResult): PageKind {
  const url = new URL(result.url);
  const path = url.pathname.toLowerCase();
  if (/(^|\.)(?:avito\.ru|profi\.ru|fl\.ru|youdo\.com)$/iu.test(url.hostname)) return "aggregator";
  if (/\/(?:blog|articles|journal|news)\//u.test(path) || /^(?:как |сколько стоит |что такое )/iu.test(result.title)) return "article";
  if (/\/(?:cases|case|portfolio|projects)\//u.test(path)) return "case";
  if (path === "/") return "home";
  if (/\/(?:services|uslugi|web-development)\//u.test(path) || /разработка.{0,40}(?:на заказ|под ключ)/iu.test(result.title)) return "service";
  return "unknown";
}

export function publicTargetUrl(path: string | null): string | null {
  if (!path?.startsWith("/services/") || /[\\?#]/u.test(path)) return null;
  const url = new URL(path, "https://kordev.team");
  return url.origin === "https://kordev.team" && url.pathname.startsWith("/services/") ? url.href : null;
}

export function eligibleCompetitors(snapshot: CompetitorSnapshot) {
  const seen = new Set<string>();
  return snapshot.results.filter(result => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    const url = new URL(result.url);
    const host = url.hostname.replace(/^www\./iu, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      host !== "kordev.team" && !host.endsWith(".kordev.team") &&
      ["service", "home", "unknown"].includes(classifyResult(result));
  });
}

const blockTags = new Set(["h1", "h2", "h3", "h4", "p", "section", "div", "article", "li", "br"]);
const ignoredTags = new Set(["script", "style", "noscript", "template"]);

function hiddenNodes(root: AnyNode): WeakSet<AnyNode> | null {
  const hidden = new WeakSet<AnyNode>();
  const pending = [{ node: root, depth: 0, inheritedHidden: false }];
  while (pending.length) {
    const { node, depth, inheritedHidden } = pending.pop()!;
    if (depth > 64) return null;
    const isHidden = inheritedHidden || ("attribs" in node &&
      (ignoredTags.has(node.name) || "hidden" in node.attribs || node.attribs["aria-hidden"] === "true"));
    if (isHidden) hidden.add(node);
    if ("children" in node) {
      for (const child of node.children) pending.push({ node: child, depth: depth + 1, inheritedHidden: isHidden });
    }
  }
  return hidden;
}

function visibleText(root: AnyNode | undefined, hidden: WeakSet<AnyNode>, spend: (units: number) => void): string {
  const parts: string[] = [];
  const pending: (AnyNode | null)[] = root ? [root] : [];
  while (pending.length) {
    const node = pending.pop()!;
    spend(1);
    if (node === null) { parts.push(" "); continue; }
    if (hidden.has(node)) continue;
    if (node.type === "text") {
      spend(node.data.length);
      parts.push(node.data);
    }
    if ("children" in node) {
      if ("name" in node && blockTags.has(node.name)) {
        parts.push(" ");
        pending.push(null);
      }
      for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index]);
    }
  }
  return compact(parts.join(""));
}

function contentFromHtml(html: string): PageContent | null {
  // Bound structural work separately from the download byte limit.
  let tags = 0;
  for (const _ of html.matchAll(/<[a-z]/giu)) if (++tags > 12_000) return null;
  const $ = load(html);
  const hidden = hiddenNodes($.root()[0]);
  if (!hidden) return null;
  // Repeated extraction from nested blocks shares one per-page budget.
  let remainingTextWork = 2 * 1024 * 1024;
  const readText = (node: AnyNode | undefined) => visibleText(node, hidden, units => {
    remainingTextWork -= units;
    if (remainingTextWork < 0) throw new Error("seo_competitor_page_unavailable");
  });
  const title = compact($("head > title").first().text());
  const description = compact($("meta[name=description]").attr("content") ?? "");
  const jsonLd = [...new Set($("script[type='application/ld+json']").toArray().flatMap(el =>
    [...$(el).text().matchAll(/"@type"\s*:\s*"([A-Za-z][A-Za-z0-9]{0,60})"/gu)].map(match => match[1])
  ))].slice(0, 12);
  const visible = (selector: string) => $(selector).toArray().filter(el => !hidden.has(el));
  const opening = readText(visible("main")[0] ?? $("body")[0]).slice(0, 800);
  const blocks = visible("h1,h2,h3,h4,p,li,dt,dd,td,summary,button").map(el => readText(el)).filter(Boolean);
  const headings = visible("h1,h2,h3,h4").map(el => readText(el)).filter(Boolean);
  const h1 = visible("h1").map(el => readText(el)).filter(Boolean);
  if (!h1.length && blocks.join(" ").length < 100) return null;
  const links = visible("a[href], button").map(el => ({
    url: ($(el).attr("href") ?? "").trim(),
    text: readText(el) || compact($(el).attr("aria-label") || ""),
  })).filter(l => !/^(?:javascript|data):/iu.test(l.url));
  const forms = visible("form").map(form => $(form).find("input:not([type=hidden]),textarea,select")
    .toArray().filter(el => !hidden.has(el)).map(el => $(el).attr("aria-label") || $(el).attr("placeholder") || $(el).attr("name"))
    .filter(Boolean).join(", ")).filter(Boolean);
  const imageAlt = visible("main img[alt], article img[alt]").map(el => compact($(el).attr("alt") ?? "")).filter(Boolean);
  return { title, description, h1, headings, blocks, opening, links, forms, jsonLd, imageAlt };
}

export type PageReader = (url: string) => Promise<{ finalUrl: string; html: string }>;

export async function buildCompetitorReport(
  snapshot: CompetitorSnapshot, competitors: string[], readPage: PageReader, clock = () => new Date(),
): Promise<CompetitorReport> {
  const target = publicTargetUrl(snapshot.targetPath);
  const allowed = new Set(eligibleCompetitors(snapshot).map(result => result.url));
  if (!target || competitors.length < 2 || competitors.length > 7 || new Set(competitors).size !== competitors.length ||
      new Set(competitors.map(url => new URL(url).hostname.replace(/^www\./iu, ""))).size !== competitors.length ||
      competitors.some(url => !allowed.has(url))) throw new Error("seo_competitor_selection_invalid");

  const pages = await Promise.all([target, ...competitors].map(async (url): Promise<CompetitorPage> => {
    try {
      const { finalUrl, html } = await readPage(url);
      const checkedAt = clock().toISOString();
      const parsed = contentFromHtml(html);
      if (!parsed || (url === target && new URL(finalUrl).origin !== "https://kordev.team")) {
        return { url, finalUrl, checkedAt, status: "unavailable", title: "", facts: {} };
      }
      const facts: Record<string, Evidence> = {};
      for (const factor of serviceFactors) {
        const excerpt = snapshotExcerpt(factor.read(parsed)?.trim() ?? "");
        facts[factor.id] = excerpt ? { status: "observed", excerpt } : { status: "not_observed" };
      }
      return { url, finalUrl, checkedAt, status: "checked", title: snapshotExcerpt(parsed.title), facts };
    } catch {
      return { url, checkedAt: clock().toISOString(), status: "unavailable", title: "", facts: {} };
    }
  }));
  const checkedDomains = new Set(["kordev.team"]);
  for (const [index, page] of pages.entries()) {
    if (index === 0 || page.status !== "checked") continue;
    const domain = new URL(page.finalUrl ?? page.url).hostname.replace(/^www\./iu, "").replace(/\.$/u, "");
    if (checkedDomains.has(domain) || domain.endsWith(".kordev.team")) {
      pages[index] = { ...page, status: "unavailable", title: "", facts: {} };
    } else {
      checkedDomains.add(domain);
    }
  }
  const findings = serviceFactors.flatMap(factor => {
    if (!factor.proposal || pages[0].facts[factor.id]?.status !== "not_observed") return [];
    const compared = pages.slice(1).filter(page => page.facts[factor.id]);
    const observed = compared.filter(page => page.facts[factor.id]?.status === "observed").length;
    return observed > 0 ? [{ factorId: factor.id, observed, checked: compared.length }] : [];
  }).sort((a, b) => b.observed - a.observed);
  return { schemaVersion: 1, snapshot, pages, findings };
}
