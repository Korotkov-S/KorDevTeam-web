import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { CtrChart, formatSeoChartDate, PositionChart, TrafficChart } from "./seo-charts";

const points = [{ date: "2026-09-23", impressions: 10, clicks: 2, ctr: 0.2, averagePosition: 8.5 }];
const changes = [{ appliedAt: "2026-09-20T10:00:00.000Z" }];

function elementsNamed(root: React.ReactNode, name: string): React.ReactElement[] {
  const found: React.ReactElement[] = [];
  function visit(node: React.ReactNode) {
    if (!React.isValidElement(node)) return;
    const type = node.type as { displayName?: string; name?: string };
    if (type.displayName === name || type.name === name) found.push(node);
    React.Children.forEach((node.props as { children?: React.ReactNode }).children, visit);
  }
  visit(root);
  return found;
}

test("SEO chart date formatter uses readable Russian order without changing invalid labels", () => {
  assert.equal(formatSeoChartDate("2026-09-23"), "23.09.2026");
  assert.equal(formatSeoChartDate("итого"), "итого");
  assert.equal(formatSeoChartDate(null), "");
});

test("all SEO time-series charts format axis and tooltip labels while keeping ISO data keys", () => {
  for (const chart of [TrafficChart({ data: points, changes }), CtrChart({ data: points, changes }), PositionChart({ data: points, changes })]) {
    const axes = elementsNamed(chart, "XAxis");
    const tooltips = elementsNamed(chart, "Tooltip");
    const markers = elementsNamed(chart, "ReferenceLine");
    assert.equal(axes.length, 1);
    assert.equal(tooltips.length, 1);
    assert.equal((axes[0].props as { tickFormatter?: unknown }).tickFormatter, formatSeoChartDate);
    assert.equal((tooltips[0].props as { labelFormatter?: unknown }).labelFormatter, formatSeoChartDate);
    assert.equal((axes[0].props as { dataKey?: unknown }).dataKey, "date");
    assert.equal((markers[0].props as { x?: unknown }).x, "2026-09-20");
  }
});
