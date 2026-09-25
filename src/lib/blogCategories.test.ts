import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOG_CATEGORIES,
  BLOG_CATEGORY_SLUGS,
  blogCategoryPath,
  getBlogCategory,
  isBlogCategorySlug,
} from "./blogCategories";

test("blog categories expose six unique complete indexable definitions", () => {
  assert.equal(BLOG_CATEGORIES.length, 6);
  assert.equal(new Set(BLOG_CATEGORY_SLUGS).size, 6);
  for (const category of BLOG_CATEGORIES) {
    assert.equal(getBlogCategory(category.slug), category);
    assert.equal(isBlogCategorySlug(category.slug), true);
    assert.equal(blogCategoryPath(category.slug), `/blog/category/${category.slug}/`);
    assert.ok(category.h1.length > 5);
    assert.ok(category.seoTitle.length > 20);
    assert.ok(category.seoDescription.length >= 100);
    assert.ok(category.intro.length >= 100);
    assert.match(category.serviceHref, /^\/services\/[a-z0-9-]+\/$/);
  }
  assert.equal(isBlogCategorySlug("unknown"), false);
});
