import { canonicalUrl, SITE_ORIGIN, type RouteSeoInput } from "./metadata";

export type JsonLdNode = Record<string, unknown>;
export function buildStructuredData(input: RouteSeoInput): JsonLdNode[] {
  const url = canonicalUrl(input);
  const organization = { "@id": `${SITE_ORIGIN}/#organization` };
  const articleAuthor = { "@type": "Person", "@id": `${SITE_ORIGIN}/#gennady-korotkov`,
    name: "Геннадий Коротков", url: `${SITE_ORIGIN}/` };
  const nodes: JsonLdNode[] = [
    { "@context": "https://schema.org", "@type": "Organization", ...organization,
      name: "KorDevTeam", url: `${SITE_ORIGIN}/`, email: "team@korotkov.dev", logo: `${SITE_ORIGIN}/opengraphlogo.jpeg` },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`,
      name: "KorDevTeam", url: `${SITE_ORIGIN}/`, inLanguage: "ru-RU", publisher: organization },
    { "@context": "https://schema.org", "@type": input.kind === "article" ? "BlogPosting" : "WebPage",
      "@id": `${url}#content`, url, name: input.title, description: input.description, inLanguage: "ru-RU",
      ...(input.kind === "article" ? { headline: input.title, publisher: organization, author: articleAuthor,
        ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
        ...(input.updatedAt ? { dateModified: input.updatedAt } : {}),
        ...(input.ogImage ? { image: new URL(input.ogImage, SITE_ORIGIN).href } : {}) } : {}) },
  ];
  if (input.breadcrumbs?.length) nodes.push({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: input.breadcrumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: canonicalUrl(crumb) })) });
  return nodes;
}
