import {
  summarize,
  explain,
  rankByVariance,
  rollingVariance,
  applyScenario,
  executiveSummaryMarkdown,
  SCENARIOS,
  formatCurrency,
  formatSignedCurrency,
  formatPct,
  formatSignedPct,
} from "./forecastAnalytics.js";

const $ = (id) => document.getElementById(id);
const REQUIRED_COLUMNS = ["month", "customer", "product", "forecast", "actual"];
const STORAGE_KEY = "forecast-actual:dataset";

const state = {
  baseRows: [], // dataset as loaded (sample or your saved data), unscaled
  working: [], // after customer/product filter + scenario
  source: "sample", // "sample" or "saved"
};

/* -------------------------------- data loading ------------------------------- */

async function loadSampleData() {
  const res = await fetch("data/sales.json");
  if (!res.ok) throw new Error(`Failed to load sample data (${res.status})`);
  return res.json();
}

// Your uploaded data is persisted locally so it survives a refresh or a return
// visit. Everything stays in this browser — nothing is uploaded to a server.
function loadSavedDataset() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rows = JSON.parse(raw);
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  }
}

function saveDataset(rows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* storage may be unavailable (private mode / quota); degrade to in-memory */
  }
}

function clearSavedDataset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function setDataset(rows, source) {
  state.baseRows = rows;
  state.source = source;
  if (source === "saved") saveDataset(rows);
  populateFilters(rows);
  $("resetBtn").hidden = source === "sample";
  updateDataSourceHint();
  applyFilters();
}

function updateDataSourceHint() {
  const label =
    state.source === "sample"
      ? "Showing the built-in sample dataset — upload a CSV to replace it with your own data."
      : "Showing your data, saved in this browser. Upload another CSV to replace it.";
  $("dataSourceHint").textContent = `${label} ${state.baseRows.length} records loaded.`;
}

/* --------------------------------- filtering --------------------------------- */

const uniqueSorted = (rows, key) => [...new Set(rows.map((r) => r[key]))].sort();

function fillSelect(id, values) {
  const current = $(id).value;
  $(id).innerHTML =
    `<option value="">All</option>` +
    values.map((v) => `<option>${escapeHtml(v)}</option>`).join("");
  if (values.includes(current)) $(id).value = current;
}

function populateFilters(rows) {
  fillSelect("customerFilter", uniqueSorted(rows, "customer"));
  fillSelect("productFilter", uniqueSorted(rows, "product"));
}

function currentScenarioKey() {
  return SCENARIOS[$("scenarioFilter").value] ? $("scenarioFilter").value : "base";
}

function applyFilters() {
  const customer = $("customerFilter").value;
  const product = $("productFilter").value;
  const filtered = state.baseRows.filter(
    (r) => (!customer || r.customer === customer) && (!product || r.product === product),
  );
  state.working = applyScenario(filtered, currentScenarioKey());
  render();
}

/* --------------------------------- rendering --------------------------------- */

function render() {
  const rows = state.working;
  const s = summarize(rows);
  const ex = explain(rows);

  renderKpis(s, ex);
  renderExec(ex);
  renderExplainer(ex);
  renderDriverTable("customerTable", rankByVariance(rows, "customer"));
  renderDriverTable("productTable", rankByVariance(rows, "product"));
  renderDetailTable(rows);
  renderRollingHint(rows);
  drawChart(rows);
}

function renderKpis(s, ex) {
  $("forecastKpi").textContent = formatCurrency(s.forecast);
  $("actualKpi").textContent = formatCurrency(s.actual);

  $("varianceKpi").textContent = formatSignedCurrency(s.variance);
  $("varianceKpi").className = s.variance >= 0 ? "good" : "bad";
  $("variancePctKpi").textContent = formatSignedPct(s.variancePct);

  $("accuracyKpi").textContent = formatPct(s.accuracy);
  $("mapeKpi").textContent = formatPct(s.mape);

  $("biasKpi").textContent = formatSignedCurrency(ex.bias.bias);
  $("biasTendencyKpi").textContent = ex.bias.tendency;
}

function renderExec(ex) {
  const badge = $("riskBadge");
  badge.textContent = ex.risk.label;
  badge.className = `risk-badge risk-${ex.risk.level}`;
  $("execHeadline").textContent = ex.headline;
  $("execRisk").textContent = ex.risk.reason;
}

function renderExplainer(ex) {
  const actions = ex.recommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  $("explainBox").innerHTML =
    `<p class="explain-headline">${escapeHtml(ex.headline)}</p>` +
    `<p>${escapeHtml(ex.narrative)}</p>` +
    `<p class="muted small">Recommended actions</p>` +
    `<ul class="actions">${actions}</ul>`;
}

function renderDriverTable(id, groups) {
  if (!groups.length) {
    $(id).innerHTML = `<tr><td colspan="5" class="muted">No data.</td></tr>`;
    return;
  }
  $(id).innerHTML = groups
    .slice(0, 6)
    .map(
      (g) => `<tr>
        <td>${escapeHtml(g.name)}</td>
        <td class="num">${formatCurrency(g.forecast)}</td>
        <td class="num">${formatCurrency(g.actual)}</td>
        <td class="num ${g.variance >= 0 ? "good" : "bad"}">${formatSignedCurrency(g.variance)}</td>
        <td class="num">${formatSignedPct(g.variancePct)}</td>
      </tr>`,
    )
    .join("");
}

function renderDetailTable(rows) {
  if (!rows.length) {
    $("detailTable").innerHTML = `<tr><td colspan="7" class="muted">No records match the current filters.</td></tr>`;
    return;
  }
  const sorted = [...rows].sort(
    (a, b) =>
      String(a.month).localeCompare(String(b.month)) ||
      String(a.customer).localeCompare(String(b.customer)),
  );
  $("detailTable").innerHTML = sorted
    .map((r) => {
      const variance = r.actual - r.forecast;
      const pct = r.forecast ? variance / r.forecast : 0;
      return `<tr>
        <td>${escapeHtml(r.month)}</td>
        <td>${escapeHtml(r.customer)}</td>
        <td>${escapeHtml(r.product)}</td>
        <td class="num">${formatCurrency(r.forecast)}</td>
        <td class="num">${formatCurrency(r.actual)}</td>
        <td class="num ${variance >= 0 ? "good" : "bad"}">${formatSignedCurrency(variance)}</td>
        <td class="num">${formatSignedPct(pct)}</td>
      </tr>`;
    })
    .join("");
}

function renderRollingHint(rows) {
  const rolling = rollingVariance(rows, 3);
  if (!rolling.length) {
    $("rollingHint").textContent = "";
    return;
  }
  const latest = rolling[rolling.length - 1];
  $("rollingHint").textContent = `Rolling 3-month variance to ${latest.month}: ${formatSignedCurrency(
    latest.variance,
  )} (${formatSignedPct(latest.variancePct)}).`;
}

/* ----------------------------------- chart ----------------------------------- */

function drawChart(rows) {
  const canvas = $("chart");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 290;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const series = aggregateByMonth(rows);
  if (!series.length) {
    ctx.fillStyle = "#aeb8d6";
    ctx.font = "13px system-ui";
    ctx.fillText("No data to chart.", 16, 28);
    return;
  }

  const pad = 40;
  const max = Math.max(...series.flatMap((d) => [d.forecast, d.actual]), 1);
  const groupWidth = (width - pad * 2) / series.length;
  const barWidth = Math.min(28, (groupWidth - 10) / 2);
  const plotHeight = height - pad - 25;

  // axes
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.beginPath();
  ctx.moveTo(pad, 15);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - 10, height - pad);
  ctx.stroke();

  series.forEach((d, i) => {
    const groupX = pad + i * groupWidth + (groupWidth - barWidth * 2 - 4) / 2;
    const fH = (d.forecast / max) * plotHeight;
    const aH = (d.actual / max) * plotHeight;

    ctx.fillStyle = "#5aa7ff";
    ctx.fillRect(groupX, height - pad - fH, barWidth, fH);
    ctx.fillStyle = "#78e3aa";
    ctx.fillRect(groupX + barWidth + 4, height - pad - aH, barWidth, aH);

    ctx.fillStyle = "#aeb8d6";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(d.month).slice(5), groupX + barWidth, height - 14);
  });

  // legend
  ctx.textAlign = "left";
  ctx.fillStyle = "#5aa7ff";
  ctx.fillRect(width - 150, 14, 10, 10);
  ctx.fillStyle = "#aeb8d6";
  ctx.fillText("Forecast", width - 135, 23);
  ctx.fillStyle = "#78e3aa";
  ctx.fillRect(width - 78, 14, 10, 10);
  ctx.fillStyle = "#aeb8d6";
  ctx.fillText("Actual", width - 63, 23);
}

function aggregateByMonth(rows) {
  const map = new Map();
  for (const r of rows) {
    const month = r.month;
    if (!map.has(month)) map.set(month, { month, forecast: 0, actual: 0 });
    map.get(month).forecast += Number(r.forecast) || 0;
    map.get(month).actual += Number(r.actual) || 0;
  }
  return [...map.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

/* ---------------------------------- exports ---------------------------------- */

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportCsv() {
  const header = ["month", "customer", "product", "forecast", "actual", "variance", "variancePct"];
  const lines = state.working.map((r) => {
    const variance = r.actual - r.forecast;
    const pct = r.forecast ? variance / r.forecast : 0;
    return [r.month, r.customer, r.product, r.forecast, r.actual, variance, pct].map(toCsvCell).join(",");
  });
  const csv = [header.map(toCsvCell).join(","), ...lines].join("\n");
  download("forecast_actual_export.csv", csv, "text/csv");
}

function exportMarkdown() {
  const md = executiveSummaryMarkdown(state.working, {
    scenarioLabel: SCENARIOS[currentScenarioKey()].label,
    filters: { customer: $("customerFilter").value, product: $("productFilter").value },
  });
  download("forecast_actual_executive_summary.md", md, "text/markdown");
}

/* --------------------------------- CSV upload -------------------------------- */

function parseCsv(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      rows.push(record);
      field = "";
      record = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length) {
    record.push(field);
    rows.push(record);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvToRecords(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`CSV is missing required column(s): ${missing.join(", ")}.`);

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows.slice(1).map((cells, rowNum) => {
    const forecast = Number(cells[idx.forecast]);
    const actual = Number(cells[idx.actual]);
    if (!Number.isFinite(forecast) || !Number.isFinite(actual)) {
      throw new Error(`Row ${rowNum + 2}: forecast and actual must be numbers.`);
    }
    return {
      month: cells[idx.month].trim(),
      customer: cells[idx.customer].trim(),
      product: cells[idx.product].trim(),
      forecast,
      actual,
    };
  });
}

function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const records = csvToRecords(String(reader.result));
      if (!records.length) throw new Error("No data rows found.");
      setDataset(records, "saved");
    } catch (err) {
      alert(`Could not read CSV: ${err.message}`);
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => alert("Could not read the selected file.");
  reader.readAsText(file);
}

/* --------------------------------- utilities --------------------------------- */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ----------------------------------- wiring ---------------------------------- */

function wireEvents() {
  $("applyBtn").addEventListener("click", applyFilters);
  $("customerFilter").addEventListener("change", applyFilters);
  $("productFilter").addEventListener("change", applyFilters);
  $("scenarioFilter").addEventListener("change", applyFilters);
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("exportMdBtn").addEventListener("click", exportMarkdown);
  $("uploadInput").addEventListener("change", handleUpload);
  $("resetBtn").addEventListener("click", () => {
    if (!confirm("Clear your saved data and load the built-in sample dataset?")) return;
    clearSavedDataset();
    loadSampleData().then((rows) => setDataset(rows, "sample"));
  });
  window.addEventListener("resize", () => drawChart(state.working));
}

async function init() {
  wireEvents();
  try {
    // Prefer your previously saved data; fall back to the built-in sample.
    const saved = loadSavedDataset();
    if (saved) {
      setDataset(saved, "saved");
    } else {
      const rows = await loadSampleData();
      setDataset(rows, "sample");
    }
  } catch (err) {
    $("execHeadline").textContent = `Failed to load data: ${err.message}`;
  }
}

init();
