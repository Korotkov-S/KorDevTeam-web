import { load } from "cheerio";

export function seoSnapshot(html: string) {
  const $ = load(html);
  return {
    lang: $("html").attr("lang"),
    title: $("head title").map((_, el) => $(el).text()).get(),
    description: $("head meta[name=description]").map((_, el) => $(el).attr("content")).get(),
    canonical: $("head link[rel=canonical]").map((_, el) => $(el).attr("href")).get(),
    h1: $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get(),
    og: $("head meta[property^='og:']").map((_, el) => `${$(el).attr("property")}:${$(el).attr("content")}`).get(),
    twitter: $("head meta[name^='twitter:']").map((_, el) => `${$(el).attr("name")}:${$(el).attr("content")}`).get(),
    robots: $("head meta[name=robots]").map((_, el) => $(el).attr("content")).get(),
  };
}
