import test from "node:test";
import assert from "node:assert/strict";
import {
  toNumber,
  summarize,
  groupBy,
  rankByVariance,
  monthlySeries,
  topVariance,
  largestPositiveVariance,
  largestNegativeVariance,
  rollingVariance,
  forecastBias,
  riskStatus,
  applyScenario,
  explain,
  executiveSummaryMarkdown,
  formatCurrency,
  formatSignedCurrency,
  formatPct,
  formatSignedPct,
  SCENARIOS,
  RISK_THRESHOLDS,
} from "../public/forecastAnalytics.js";

const sample = [
  { month: "2026-01", customer: "A", product: "X", forecast: 100, actual: 90 },
  { month: "2026-02", customer: "A", product: "X", forecast: 100, actual: 110 },
  { month: "2026-03", customer: "B", product: "Y", forecast: 200, actual: 260 },
];

test("toNumber coerces safely", () => {
  assert.equal(toNumber("42"), 42);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber("nope"), 0);
  assert.equal(toNumber(undefined), 0);
});

test("summarize totals forecast, actual, and variance", () => {
  const s = summarize(sample);
  assert.equal(s.forecast, 400);
  assert.equal(s.actual, 460);
  assert.equal(s.variance, 60);
  assert.equal(s.count, 3);
  assert.ok(Math.abs(s.variancePct - 0.15) < 1e-9);
});

test("summarize computes MAPE and accuracy", () => {
  // APEs: 10/100, 10/100, 60/200 = 0.1, 0.1, 0.3 -> mean 0.1667
  const s = summarize(sample);
  assert.ok(Math.abs(s.mape - (0.1 + 0.1 + 0.3) / 3) < 1e-9);
  assert.ok(Math.abs(s.accuracy - (1 - s.mape)) < 1e-9);
});

test("summarize computes signed forecast bias", () => {
  const s = summarize(sample);
  assert.ok(Math.abs(s.bias - 60 / 3) < 1e-9); // +20 per row -> under-forecasting
  assert.ok(s.biasPct > 0);
});

test("summarize handles empty input without dividing by zero", () => {
  const s = summarize([]);
  assert.equal(s.forecast, 0);
  assert.equal(s.variancePct, 0);
  assert.equal(s.mape, 0);
  assert.equal(s.accuracy, 1);
  assert.equal(s.bias, 0);
});

test("summarize excludes zero-forecast rows from MAPE", () => {
  const s = summarize([
    { forecast: 0, actual: 50 },
    { forecast: 100, actual: 120 },
  ]);
  assert.ok(Math.abs(s.mape - 0.2) < 1e-9); // only the second row counts
});

test("groupBy summarizes each group", () => {
  const groups = groupBy(sample, "customer");
  const a = groups.find((g) => g.name === "A");
  assert.equal(a.forecast, 200);
  assert.equal(a.actual, 200);
  assert.equal(a.variance, 0);
});

test("rankByVariance sorts by absolute variance descending", () => {
  const ranked = rankByVariance(sample, "customer");
  assert.equal(ranked[0].name, "B"); // +60 beats A's 0
  assert.ok(ranked[0].absVariance >= ranked[1].absVariance);
});

test("monthlySeries aggregates and sorts by month", () => {
  const series = monthlySeries(sample);
  assert.deepEqual(
    series.map((m) => m.month),
    ["2026-01", "2026-02", "2026-03"],
  );
  assert.equal(series[2].actual, 260);
  assert.equal(series[2].variance, 60);
});

test("topVariance returns line items ranked by absolute variance", () => {
  const top = topVariance(sample, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].variance, 60); // B/Y month 3
  assert.ok(Math.abs(top[0].variance) >= Math.abs(top[1].variance));
});

test("largest positive and negative variance line items", () => {
  const pos = largestPositiveVariance(sample);
  const neg = largestNegativeVariance(sample);
  assert.equal(pos.variance, 60);
  assert.equal(neg.variance, -10);
});

test("largestNegativeVariance returns null when nothing is negative", () => {
  assert.equal(largestNegativeVariance([{ forecast: 100, actual: 120 }]), null);
});

test("rollingVariance sums a trailing window", () => {
  const rows = [
    { month: "2026-01", forecast: 100, actual: 90 },
    { month: "2026-02", forecast: 100, actual: 110 },
    { month: "2026-03", forecast: 100, actual: 130 },
    { month: "2026-04", forecast: 100, actual: 100 },
  ];
  const roll = rollingVariance(rows, 3);
  assert.equal(roll.length, 2); // months 03 and 04 have a full 3-window
  assert.equal(roll[0].month, "2026-03");
  assert.equal(roll[0].forecast, 300);
  assert.equal(roll[0].actual, 330);
  assert.equal(roll[0].variance, 30);
});

test("forecastBias reports tendency", () => {
  assert.equal(forecastBias(sample).tendency, "under-forecasting");
  assert.equal(forecastBias([{ forecast: 100, actual: 80 }]).tendency, "over-forecasting");
  assert.equal(forecastBias([{ forecast: 100, actual: 100 }]).tendency, "balanced");
});

test("riskStatus classifies controlled / watch / critical", () => {
  const controlled = riskStatus([
    { forecast: 1000, actual: 1010 },
    { forecast: 1000, actual: 995 },
  ]);
  assert.equal(controlled.level, "controlled");

  const critical = riskStatus([{ forecast: 100, actual: 60 }]); // 40% off
  assert.equal(critical.level, "critical");

  const watch = riskStatus([
    { forecast: 100, actual: 106 },
    { forecast: 100, actual: 95 },
  ]); // ~5.5% MAPE, small total variance
  assert.equal(watch.level, "watch");
});

test("riskStatus accepts a precomputed summary", () => {
  const s = summarize(sample);
  assert.equal(riskStatus(s).level, riskStatus(sample).level);
});

test("risk thresholds are exported and ordered", () => {
  assert.ok(RISK_THRESHOLDS.controlled.minAccuracy > RISK_THRESHOLDS.watch.minAccuracy);
});

test("applyScenario scales actuals and leaves base untouched", () => {
  const base = applyScenario(sample, "base");
  assert.deepEqual(
    base.map((r) => r.actual),
    [90, 110, 260],
  );
  const optimistic = applyScenario(sample, "optimistic");
  assert.equal(optimistic[0].actual, Math.round(90 * SCENARIOS.optimistic.actualFactor));
  // Forecast is never changed by a scenario.
  assert.equal(optimistic[0].forecast, 100);
  const downside = applyScenario(sample, "downside");
  assert.ok(downside[0].actual < 90);
});

test("applyScenario does not mutate the input", () => {
  const copy = JSON.parse(JSON.stringify(sample));
  applyScenario(sample, "optimistic");
  assert.deepEqual(sample, copy);
});

test("explain returns grounded, structured output", () => {
  const ex = explain(sample);
  assert.ok(ex.headline.includes("forecast"));
  assert.ok(Array.isArray(ex.recommendedActions) && ex.recommendedActions.length > 0);
  assert.equal(ex.drivers.topCustomer.name, "B");
  assert.ok(["controlled", "watch", "critical"].includes(ex.risk.level));
  assert.equal(ex.summary.variance, 60);
});

test("explain handles empty input", () => {
  const ex = explain([]);
  assert.ok(ex.headline.toLowerCase().includes("no records"));
  assert.ok(ex.recommendedActions.length > 0);
});

test("executiveSummaryMarkdown produces a report with key sections", () => {
  const md = executiveSummaryMarkdown(sample, { scenarioLabel: "Base (reported)" });
  assert.ok(md.startsWith("# Forecast vs Actual — Executive Summary"));
  assert.ok(md.includes("## Key metrics"));
  assert.ok(md.includes("## Recommended actions"));
  assert.ok(md.includes("Risk status"));
});

test("executiveSummaryMarkdown handles empty input", () => {
  const md = executiveSummaryMarkdown([], {});
  assert.ok(md.includes("No records match"));
});

test("formatters render currency and percentages", () => {
  assert.equal(formatCurrency(1234), "$1,234");
  assert.equal(formatSignedCurrency(-1234), "-$1,234");
  assert.equal(formatSignedCurrency(1234), "+$1,234");
  assert.equal(formatPct(0.153), "15.3%");
  assert.equal(formatSignedPct(0.15), "+15%");
});
