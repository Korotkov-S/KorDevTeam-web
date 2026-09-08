function compactStrings(values, limit) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function buildProjectCardPresentation(project) {
  const preferredHighlights =
    Array.isArray(project?.highlights) && project.highlights.length > 0
      ? project.highlights
      : project?.features;
  const highlights = compactStrings(
    preferredHighlights,
    3,
  );

  return {
    summary: String(project?.impact || project?.description || "").trim(),
    highlights,
  };
}
