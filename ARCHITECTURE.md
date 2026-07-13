# Architecture

## 1. Current architecture (local, zero-dependency)

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
│ Your uploaded CSV    │     │ forecastAnalytics.js      │     │ app.js + index.html │
│ (saved in browser)   │ ──▶ │ (pure functions)          │ ──▶ │ (DOM rendering)     │
│ OR built-in          │     │ summarize / groupBy /      │     │ KPIs, chart, tables │
│ sample sales.json    │     │ risk / bias / rolling /    │     │ explainer, exports  │
└─────────────────────┘     │ explain / markdown export  │     └────────────────────┘
                             └──────────────────────────┘
```

- **Data** is either a CSV you upload in the browser or the built-in sample `sales.json`.
  Uploaded data is parsed client-side, **saved to `localStorage`** so it survives a refresh, and
  **never sent to any server**.
- **Analytics** live in one pure ES module, `public/forecastAnalytics.js`. It has no browser or
  Node dependencies, so the exact same code runs in the browser, in the `node --test` suite, and
  during the lint smoke-check. This is why there is no build step.
- **Rendering** in `app.js` reads the computed metrics and paints KPI tiles, a canvas chart,
  driver tables, the detail table, and the explainer. Filters and the scenario toggle simply
  recompute from the source rows.
- **Serving** is a ~30-line static file server (`scripts/serve.mjs`). For deployment the same
  `public/` folder is published as a static site (GitHub Pages workflow included).

### Request/compute flow

1. Load records — your saved data from `localStorage` if present, otherwise the built-in sample.
2. Filter by customer / product.
3. Apply the selected scenario (a sensitivity multiplier on actuals).
4. `summarize`, `explain`, `rankByVariance`, and `rollingVariance` compute every metric.
5. The UI renders; the explainer narrates the already-computed numbers.

## 2. Data model

Each record is one **customer × product × month** forecast/actual pair:

| Field | Type | Meaning |
| --- | --- | --- |
| `month` | string `YYYY-MM` | Reporting period (sortable) |
| `customer` | string | Customer / account |
| `product` | string | Product or program |
| `forecast` | number | Planned sales value for the period |
| `actual` | number | Realized sales value for the period |

This is a classic **fact table** grain. `customer`, `product`, and `month` are the dimensions;
`forecast` and `actual` are the measures. In a warehouse these would be foreign keys to
dimension tables plus a date dimension.

## 3. Forecast metric definitions

All formulas are implemented in `public/forecastAnalytics.js` and covered by unit tests.

| Metric | Formula | Notes |
| --- | --- | --- |
| **Variance** | `Σactual − Σforecast` | Positive = actuals above plan |
| **Variance %** | `variance / Σforecast` | Guarded against zero forecast |
| **MAPE** | `mean( |actual − forecast| / |forecast| )` | Per line item; zero-forecast rows excluded |
| **Forecast accuracy** | `1 − MAPE` (floored at 0) | Headline "how good was the plan" number |
| **Forecast bias** | `mean(actual − forecast)` | Signed. `> 0` ⇒ under-forecasting; `< 0` ⇒ over-forecasting |
| **Rolling 3-month variance** | variance summed over a trailing 3-month window | Smooths single-month noise |
| **Top driver** | group by customer/product, rank by `|variance|` | Finds what moved the number |
| **Risk status** | see below | Controlled / Watch / Critical |

### Risk status thresholds

Exported as `RISK_THRESHOLDS` so the UI, tests, and this doc share one definition.

| Level | Condition |
| --- | --- |
| **Controlled** | accuracy ≥ 95% **and** \|variance %\| ≤ 3% |
| **Watch** | accuracy ≥ 90% **and** \|variance %\| ≤ 7% |
| **Critical** | anything worse |

### Scenario sensitivity

`SCENARIOS` applies a multiplier to **actuals** (the realization) while holding the **forecast**
(the plan) fixed:

| Scenario | Actual factor |
| --- | --- |
| Base (reported) | ×1.00 |
| Optimistic | ×1.05 |
| Downside | ×0.92 |

This is deliberate what-if sensitivity analysis, not a prediction. It lets a user see how KPIs and
risk status move under alternative demand outcomes.

## 4. AI explainer governance

The "AI-style business explainer" is a **grounded, deterministic narrative generator**. The
governance contract is:

- **Numbers come from analytics; words come from the explainer.** The explainer receives only the
  already-computed metrics (variance, MAPE, accuracy, bias, drivers, risk) and composes sentences
  and recommended actions from them.
- **No fabrication.** It never introduces a figure that was not computed from the data, and it
  cannot "predict" — forecasting is the analytics layer's job.
- **Traceability.** Every sentence maps back to a value visible on the dashboard, so a reviewer
  can check the narrative against the KPIs.
- **Transparency.** The UI states, next to the narrative, that it is generated from structured
  metrics rather than a language model.

This mirrors the responsible pattern for a real GenAI layer: the language model (or, here, the
deterministic composer) explains a trusted semantic model — it is not the source of truth.

## 5. Extending it (optional)

The app is complete and usable as-is: upload data, analyze it, export the results. If you want to
grow it into a larger system, these are the natural extensions — each is independent, so you can
add only what you need:

1. **Live data source.** Replace the CSV/`localStorage` layer with a fetch from a warehouse or API
   (e.g. a Fabric Lakehouse/Warehouse, Databricks SQL, or a REST endpoint). Only the data-loading
   functions in `app.js` change; the analytics core stays identical.
2. **Forecast generation.** This app *analyzes* an existing forecast. Add a time-series / ML model
   (with backtesting and error tracking) if you also want to *produce* forecasts.
3. **Shared semantic layer.** Move the metric definitions into a BI semantic model (e.g. Power BI
   DAX measures) if you want the same numbers reused across reports.
4. **Data quality & lineage.** Add refresh monitoring and automated data-quality checks for a
   scheduled feed.
5. **Multi-user hosting.** Add accounts and role-based access with per-region / per-account
   drilldowns if the tool needs to serve a team rather than a single browser.
6. **Retrieval-grounded narrative.** Swap the deterministic explainer for an LLM narrative that
   reads the computed metrics — keeping the same "numbers from analytics, words from the
   explainer" contract so figures are never invented.
