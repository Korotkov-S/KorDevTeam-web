import { data, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Blog } from "../components/Blog";
import type { BlogPostCardView } from "../components/BlogCard";
import {
  blogCategoryPath,
  getBlogCategory,
  type BlogCategoryDefinition,
} from "../lib/blogCategories";
import { articleCard } from "../server/content/presentation";
import { listPublishedEntries, type ContentEntry } from "../server/content/service";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMaps } from "../server/media/presentation";
import type { RouteSeoInput } from "../server/seo/metadata";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export function selectPublishedCategory(categorySlug: unknown, entries: ContentEntry[]) {
  const category = getBlogCategory(categorySlug);
  if (!category) return null;
  const selectedEntries = entries.filter(entry => entry.payload.category === category.slug);
  return selectedEntries.length ? { category, entries: selectedEntries } : null;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const selected = selectPublishedCategory(params.category, await listPublishedEntries("article"));
  if (!selected) throw new Response(null, { status: 404, headers: documentHeaders });
  const media = await getEntryMediaMaps(selected.entries.map(entry => entry.id));
  const seo: RouteSeoInput = {
    pathname: blogCategoryPath(selected.category.slug),
    title: selected.category.seoTitle,
    description: selected.category.seoDescription,
    indexable: true,
    kind: "page",
  };
  return data({
    seo,
    category: selected.category,
    posts: selected.entries.map(entry => articleCard(entry, media[entry.id])),
  }, { headers: documentHeaders });
}

export function BlogCategoryContent({
  category,
  posts,
}: {
  category: BlogCategoryDefinition;
  posts: BlogPostCardView[];
}) {
  return (
    <div className="pt-20">
      <Blog
        mode="category"
        posts={posts}
        heading={{
          eyebrow: "Категория блога",
          title: category.h1,
          description: category.intro,
        }}
        serviceLink={{ href: category.serviceHref, label: category.serviceLabel }}
        breadcrumbs={(
          <nav aria-label="Хлебные крошки" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-[var(--public-subtle)]">
            <Link to="/blog/" className="underline underline-offset-4">Блог</Link>
            <span aria-hidden="true">→</span>
            <span aria-current="page">{category.h1}</span>
          </nav>
        )}
      />
    </div>
  );
}

export default function BlogCategory() {
  const value = useLoaderData<typeof loader>();
  return <BlogCategoryContent category={value.category} posts={value.posts} />;
}
