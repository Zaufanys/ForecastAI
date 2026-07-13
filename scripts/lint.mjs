/**
 * Lightweight, dependency-free project check.
 * Verifies the expected files exist, the sample data is valid, and the
 * analytics core imports and produces well-formed output. Exits non-zero on
 * any problem so CI fails loudly.
 */
import fs from "node:fs";

const requiredFiles = [
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/forecastAnalytics.js",
  "public/data/sales.json",
  "README.md",
  "ARCHITECTURE.md",
  "package.json",
];

const problems = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) problems.push(`Missing file: ${file}`);
}

// Validate the sample dataset shape.
try {
  const data = JSON.parse(fs.readFileSync("public/data/sales.json", "utf8"));
  if (!Array.isArray(data) || data.length === 0) {
    problems.push("sales.json must be a non-empty array.");
  } else {
    data.forEach((row, i) => {
      for (const key of ["month", "customer", "product", "forecast", "actual"]) {
        if (!(key in row)) problems.push(`sales.json[${i}] missing "${key}"`);
      }
    });
  }
} catch (err) {
  problems.push(`sales.json is not valid JSON: ${err.message}`);
}

// Smoke-check the analytics core.
try {
  const mod = await import("../public/forecastAnalytics.js");
  const s = mod.summarize([{ month: "2026-01", customer: "A", product: "X", forecast: 100, actual: 110 }]);
  if (s.variance !== 10) problems.push(`summarize() returned unexpected variance: ${s.variance}`);
  if (typeof mod.explain([]).headline !== "string") problems.push("explain() must return a headline string.");
} catch (err) {
  problems.push(`Failed to import analytics core: ${err.message}`);
}

if (problems.length) {
  console.error("Lint failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("Project structure, sample data, and analytics core all OK.");
