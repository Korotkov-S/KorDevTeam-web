import { Link } from "react-router-dom";
import {
  BLOG_CATEGORIES,
  blogCategoryPath,
  type BlogCategorySlug,
} from "../lib/blogCategories";

function articleCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "статей";
  if (mod10 === 1) return "статья";
  if (mod10 >= 2 && mod10 <= 4) return "статьи";
  return "статей";
}

export function BlogCategoryNav({
  counts,
}: {
  counts: Partial<Record<BlogCategorySlug, number>>;
}) {
  return (
    <nav aria-label="Категории блога" className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {BLOG_CATEGORIES.map(category => {
        const count = counts[category.slug] ?? 0;
        return (
          <Link
            key={category.slug}
            to={blogCategoryPath(category.slug)}
            className="group flex min-w-0 flex-col rounded-[var(--public-radius-card)] border border-border bg-card p-5 transition-colors hover:border-[var(--public-violet)] focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span className="flex items-start justify-between gap-4">
              <span className="text-lg font-semibold leading-tight tracking-tight text-[var(--public-ink)] group-hover:text-[var(--public-violet)]">
                {category.title}
              </span>
              <span className="shrink-0 text-sm text-[var(--public-subtle)]">
                <span data-category-count>{count}</span> {articleCountLabel(count)}
              </span>
            </span>
            <span className="mt-3 text-sm leading-6 text-[var(--public-subtle)]">
              {category.intro}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
