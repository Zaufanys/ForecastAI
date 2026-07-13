/**
 * Stage the static site for GitHub Pages.
 *
 * The whole app is self-contained under public/ (HTML, CSS, the ES-module
 * analytics core, and the sample data), so "building" is just copying that
 * folder to _site/ and adding a .nojekyll marker so Pages serves every file
 * verbatim. No bundler, no framework, no external dependencies.
 */
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("public");
const out = path.resolve("_site");

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(path.join(out, ".nojekyll"), "");

const count = fs.readdirSync(out, { recursive: true }).filter((f) => typeof f === "string").length;
console.log(`Staged ${count} entries from public/ into _site/ for GitHub Pages.`);
