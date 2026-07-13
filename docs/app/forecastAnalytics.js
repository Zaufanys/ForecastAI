/**
 * forecastAnalytics.js
 * -------------------------------------------------------------------------
 * Deterministic forecast-vs-actual analytics core.
 *
 * Every number the dashboard shows — and every sentence the "AI-style"
 * explainer produces — is derived here from structured data. There is no
 * model call and nothing is invented: the explainer only translates these
 * computed values into business language. Keeping the maths in one pure,
 * dependency-free ES module means the exact same code runs in the browser,
 * in the Node test runner, and on GitHub Pages with no build step.
 * -------------------------------------------------------------------------
 */

/** Risk thresholds, exported so the UI, tests, and docs share one source. */
export const RISK_THRESHOLDS = {
  // "controlled" when accuracy is high AND absolute total variance is small.
  controlled: { minAccuracy: 0.95, maxAbsVariancePct: 0.03 },
  // "watch" is the middle band; anything worse is "critical".
  watch: { minAccuracy: 0.9, maxAbsVariancePct: 0.07 },
};

/**
 * Scenario sensitivity band. The forecast (the plan) is held fixed; actuals
 * (the realization) are flexed by a multiplier so a user can stress-test how
 * KPIs and risk status move under alternative demand outcomes. "base" is the
 * reported data. This is what-if sensitivity analysis, not a prediction.
 */
export const SCENARIOS = {
  base: { key: "base", label: "Base (reported)", actualFactor: 1 },
  optimistic: { key: "optimistic", label: "Optimistic (+5%)", actualFactor: 1.05 },
  downside: { key: "downside", label: "Downside (-8%)", actualFactor: 0.92 },
};

/** Coerce anything to a finite number, defaulting to 0. */
export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Core roll-up for a set of records.
 * @returns {{count,forecast,actual,variance,absVariance,variancePct,
 *            mape,accuracy,bias,biasPct}}
 */
export function summarize(records = []) {
  const count = records.length;
  const forecast = records.reduce((sum, r) => sum + toNumber(r.forecast), 0);
  const actual = records.reduce((sum, r) => sum + toNumber(r.actual), 0);
  const variance = actual - forecast;
  const variancePct = forecast ? variance / forecast : 0;

  // MAPE: mean absolute percentage error, excluding rows with a zero forecast
  // (division by zero is undefined, so those rows can't contribute).
  const scored = records.filter((r) => toNumber(r.forecast) !== 0);
  const mape = scored.length
    ? scored.reduce(
        (sum, r) =>
          sum + Math.abs(toNumber(r.actual) - toNumber(r.forecast)) / Math.abs(toNumber(r.forecast)),
        0,
      ) / scored.length
    : 0;
  const accuracy = Math.max(0, 1 - mape);

  // Forecast bias: signed mean error. Positive => actuals tend to come in
  // above forecast (we are under-forecasting); negative => over-forecasting.
  const bias = count ? variance / count : 0;
  const meanForecast = count ? forecast / count : 0;
  const biasPct = meanForecast ? bias / meanForecast : 0;

  return {
    count,
    forecast,
    actual,
    variance,
    absVariance: Math.abs(variance),
    variancePct,
    mape,
    accuracy,
    bias,
    biasPct,
  };
}

/** Group records by a field and summarize each group. */
export function groupBy(records = [], key) {
  const map = new Map();
  for (const r of records) {
    const k = r[key] ?? "Unknown";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()].map(([name, rows]) => ({ name, rows, ...summarize(rows) }));
}

/** Groups sorted by absolute variance, largest first. */
export function rankByVariance(records = [], key) {
  return groupBy(records, key).sort((a, b) => b.absVariance - a.absVariance);
}

/** Aggregate to one row per month, chronologically sorted. */
export function monthlySeries(records = []) {
  const map = new Map();
  for (const r of records) {
    const month = r.month ?? "Unknown";
    if (!map.has(month)) map.set(month, { month, forecast: 0, actual: 0 });
    const bucket = map.get(month);
    bucket.forecast += toNumber(r.forecast);
    bucket.actual += toNumber(r.actual);
  }
  return [...map.values()]
    .map((m) => ({ ...m, variance: m.actual - m.forecast, variancePct: m.forecast ? (m.actual - m.forecast) / m.forecast : 0 }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

/** Line items ranked by absolute variance, largest first. */
export function topVariance(records = [], limit = 5) {
  return records
    .map((r) => {
      const variance = toNumber(r.actual) - toNumber(r.forecast);
      return {
        ...r,
        variance,
        variancePct: toNumber(r.forecast) ? variance / toNumber(r.forecast) : 0,
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, limit);
}

/** The single most positive (actual over forecast) line item, or null. */
export function largestPositiveVariance(records = []) {
  return topVariance(records, records.length)
    .filter((r) => r.variance > 0)
    .sort((a, b) => b.variance - a.variance)[0] ?? null;
}

/** The single most negative (actual under forecast) line item, or null. */
export function largestNegativeVariance(records = []) {
  return topVariance(records, records.length)
    .filter((r) => r.variance < 0)
    .sort((a, b) => a.variance - b.variance)[0] ?? null;
}

/**
 * Rolling variance over a trailing window of months. For each month i it sums
 * forecast and actual across months [i-window+1 .. i] and reports the variance
 * of that window. Returns one entry per month that has a full window.
 */
export function rollingVariance(records = [], window = 3) {
  const series = monthlySeries(records);
  const out = [];
  for (let i = window - 1; i < series.length; i += 1) {
    const slice = series.slice(i - window + 1, i + 1);
    const forecast = slice.reduce((s, m) => s + m.forecast, 0);
    const actual = slice.reduce((s, m) => s + m.actual, 0);
    out.push({
      month: series[i].month,
      window,
      forecast,
      actual,
      variance: actual - forecast,
      variancePct: forecast ? (actual - forecast) / forecast : 0,
    });
  }
  return out;
}

/** Forecast bias with a plain-language tendency label. */
export function forecastBias(records = []) {
  const { bias, biasPct } = summarize(records);
  let tendency = "balanced";
  if (biasPct > 0.01) tendency = "under-forecasting";
  else if (biasPct < -0.01) tendency = "over-forecasting";
  return { bias, biasPct, tendency };
}

/**
 * Overall risk classification from accuracy and absolute total variance.
 * Accepts either raw records or an existing summary object.
 */
export function riskStatus(recordsOrSummary = []) {
  const s = Array.isArray(recordsOrSummary) ? summarize(recordsOrSummary) : recordsOrSummary;
  const absVariancePct = Math.abs(s.variancePct ?? 0);
  const accuracy = s.accuracy ?? 0;
  const { controlled, watch } = RISK_THRESHOLDS;

  if (accuracy >= controlled.minAccuracy && absVariancePct <= controlled.maxAbsVariancePct) {
    return {
      level: "controlled",
      label: "Controlled",
      reason: "Accuracy is high and total variance is within tolerance.",
    };
  }
  if (accuracy >= watch.minAccuracy && absVariancePct <= watch.maxAbsVariancePct) {
    return {
      level: "watch",
      label: "Watch",
      reason: "Accuracy or total variance is drifting; monitor next cycle.",
    };
  }
  return {
    level: "critical",
    label: "Critical",
    reason: "Accuracy is low or total variance exceeds tolerance; action needed.",
  };
}

/** Apply a scenario sensitivity multiplier to the actuals of each record. */
export function applyScenario(records = [], scenarioKey = "base") {
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.base;
  if (scenario.actualFactor === 1) return records.map((r) => ({ ...r }));
  return records.map((r) => ({
    ...r,
    actual: Math.round(toNumber(r.actual) * scenario.actualFactor),
  }));
}

/**
 * Build the full structured explanation. Nothing here is generated by a
 * language model: every field is composed from the deterministic metrics
 * above. This is the "grounded narrative" the dashboard renders.
 */
export function explain(records = []) {
  const summary = summarize(records);
  const risk = riskStatus(summary);
  const bias = forecastBias(records);
  const byCustomer = rankByVariance(records, "customer");
  const byProduct = rankByVariance(records, "product");
  const topCustomer = byCustomer[0] ?? null;
  const topProduct = byProduct[0] ?? null;
  const largestPositive = largestPositiveVariance(records);
  const largestNegative = largestNegativeVariance(records);

  const direction = summary.variance >= 0 ? "above" : "below";
  const biasSentence =
    bias.tendency === "balanced"
      ? "Forecast bias is negligible, so the plan is well-centred."
      : `Forecasts show a tendency toward ${bias.tendency} (bias ${formatSignedPct(bias.biasPct)}).`;

  const headline = summary.count
    ? `Actual sales are ${direction} forecast by ${formatCurrency(summary.absVariance)} (${formatPct(
        Math.abs(summary.variancePct),
      )}), with ${formatPct(summary.accuracy)} forecast accuracy.`
    : "No records match the current filters.";

  const narrative = summary.count
    ? [
        `Forecast accuracy is ${formatPct(summary.accuracy)} (MAPE ${formatPct(summary.mape)}).`,
        biasSentence,
        topCustomer ? `The largest customer variance driver is ${topCustomer.name} (${formatSignedCurrency(topCustomer.variance)}).` : "",
        topProduct ? `The largest product variance driver is ${topProduct.name} (${formatSignedCurrency(topProduct.variance)}).` : "",
        largestPositive ? `Biggest upside line: ${largestPositive.customer} / ${largestPositive.product} in ${largestPositive.month} (${formatSignedCurrency(largestPositive.variance)}).` : "",
        largestNegative ? `Biggest shortfall line: ${largestNegative.customer} / ${largestNegative.product} in ${largestNegative.month} (${formatSignedCurrency(largestNegative.variance)}).` : "",
        `Overall risk status is ${risk.label.toLowerCase()} — ${risk.reason}`,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const recommendedActions = buildActions({ summary, risk, bias, topCustomer, topProduct, largestNegative });

  return {
    headline,
    narrative,
    risk,
    bias,
    summary,
    drivers: { topCustomer, topProduct, largestPositive, largestNegative },
    recommendedActions,
  };
}

/** Compose next-step recommendations from the computed signals. */
function buildActions({ summary, risk, bias, topCustomer, topProduct, largestNegative }) {
  if (!summary.count) return ["Adjust filters to load data for analysis."];
  const actions = [];

  if (risk.level === "critical") {
    actions.push("Escalate: re-baseline the forecast with the sales owner before the next planning cycle.");
  } else if (risk.level === "watch") {
    actions.push("Review forecast assumptions with the sales owner and tighten the next-cycle forecast.");
  } else {
    actions.push("Maintain current cadence; variance is within a controlled range.");
  }

  if (topCustomer) {
    actions.push(`Investigate customer-level variance for ${topCustomer.name} (${formatSignedCurrency(topCustomer.variance)}).`);
  }
  if (topProduct && topProduct.name !== topCustomer?.name) {
    actions.push(`Check product/program drivers for ${topProduct.name} (${formatSignedCurrency(topProduct.variance)}).`);
  }
  if (largestNegative) {
    actions.push(`Confirm supply and demand signals behind the ${largestNegative.month} shortfall for ${largestNegative.customer}.`);
  }
  if (bias.tendency !== "balanced") {
    actions.push(`Correct the systematic ${bias.tendency} bias in the forecasting method.`);
  }
  actions.push("Document known business events driving variance so future forecast models can learn from them.");
  return actions;
}

/**
 * Render an executive-summary Markdown document from the structured
 * explanation — used by the dashboard's "Export summary (Markdown)" button.
 */
export function executiveSummaryMarkdown(records = [], meta = {}) {
  const { scenarioLabel = SCENARIOS.base.label, filters = {}, generatedAt = "" } = meta;
  const ex = explain(records);
  const s = ex.summary;
  const filterLine = [
    filters.customer ? `Customer: ${filters.customer}` : "Customer: All",
    filters.product ? `Product: ${filters.product}` : "Product: All",
    `Scenario: ${scenarioLabel}`,
  ].join(" · ");

  if (!s.count) {
    return `# Forecast vs Actual — Executive Summary\n\n_${filterLine}_\n\nNo records match the current filters.\n`;
  }

  const lines = [
    "# Forecast vs Actual — Executive Summary",
    "",
    `_${filterLine}_`,
    generatedAt ? `_Generated: ${generatedAt}_` : "",
    "",
    `**Risk status: ${ex.risk.label}** — ${ex.risk.reason}`,
    "",
    "## Headline",
    ex.headline,
    "",
    "## Key metrics",
    "| Metric | Value |",
    "| --- | --- |",
    `| Forecast | ${formatCurrency(s.forecast)} |`,
    `| Actual | ${formatCurrency(s.actual)} |`,
    `| Variance | ${formatSignedCurrency(s.variance)} (${formatSignedPct(s.variancePct)}) |`,
    `| Forecast accuracy | ${formatPct(s.accuracy)} |`,
    `| MAPE | ${formatPct(s.mape)} |`,
    `| Forecast bias | ${formatSignedCurrency(ex.bias.bias)} (${ex.bias.tendency}) |`,
    "",
    "## Drivers",
    ex.drivers.topCustomer ? `- Top customer driver: **${ex.drivers.topCustomer.name}** (${formatSignedCurrency(ex.drivers.topCustomer.variance)})` : "",
    ex.drivers.topProduct ? `- Top product driver: **${ex.drivers.topProduct.name}** (${formatSignedCurrency(ex.drivers.topProduct.variance)})` : "",
    ex.drivers.largestPositive ? `- Biggest upside: ${ex.drivers.largestPositive.customer} / ${ex.drivers.largestPositive.product}, ${ex.drivers.largestPositive.month} (${formatSignedCurrency(ex.drivers.largestPositive.variance)})` : "",
    ex.drivers.largestNegative ? `- Biggest shortfall: ${ex.drivers.largestNegative.customer} / ${ex.drivers.largestNegative.product}, ${ex.drivers.largestNegative.month} (${formatSignedCurrency(ex.drivers.largestNegative.variance)})` : "",
    "",
    "## Recommended actions",
    ...ex.recommendedActions.map((a) => `1. ${a}`),
    "",
    "---",
    "_Figures are computed deterministically from the source data. The narrative is generated from the metrics above, not from a language model._",
    "",
  ];
  return lines.filter((l) => l !== "").join("\n") + "\n";
}

/* --------------------------------- formatters -------------------------------- */

export function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(n));
}

export function formatSignedCurrency(n) {
  const value = toNumber(n);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function formatPct(n) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(toNumber(n));
}

export function formatSignedPct(n) {
  const value = toNumber(n);
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPct(value)}`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(toNumber(n));
}
