# Setup guide

How to get the **Forecast vs Actual Dashboard with AI Explainer** installed and running.

There are two ways to read this file:

- **Section A** is a ready-to-paste prompt you can hand to a coding agent (Cowork, Claude Code,
  etc.) to do the whole setup for you.
- **Sections B–F** are the same steps written out for a person, plus data format, deployment,
  and troubleshooting.

Where the code lives right now:

| | |
| --- | --- |
| Repository | `Zaufanys/CLAUDE-CODE-SYSTEM-PROMPT1` |
| Branch | `claude/new-project-repo-e6hrij` |
| Project folder | `forecast-actual-ai-explainer/` |
| Requirements | Node.js **18+** (no other dependencies) |

---

## A. Copy-paste prompt for a coding agent (Cowork / Claude Code)

> Paste everything in the block below into a fresh Cowork/agent session. It assumes the agent has
> a terminal with `git` and `node` (18+).

```text
You are setting up and running a project called "Forecast vs Actual Dashboard with AI Explainer".

WHERE THE CODE IS
- GitHub repo: https://github.com/Zaufanys/CLAUDE-CODE-SYSTEM-PROMPT1
- Branch: claude/new-project-repo-e6hrij
- The project is in the subfolder: forecast-actual-ai-explainer/
(If the repo is private, authenticate first — e.g. `gh auth login` or a GitHub token — then clone.)

WHAT IT IS
A zero-dependency static web app (plain HTML/CSS/ES modules + a tiny Node static server) for
forecast-vs-actual sales variance analysis. There is NO framework and NO build step. Node 18+ is
the only requirement. Do not add dependencies.

DO THIS
1. Clone the repo and check out the branch, then enter the project folder:
   git clone https://github.com/Zaufanys/CLAUDE-CODE-SYSTEM-PROMPT1.git
   cd CLAUDE-CODE-SYSTEM-PROMPT1
   git checkout claude/new-project-repo-e6hrij
   cd forecast-actual-ai-explainer
2. Confirm Node is 18 or newer: node --version
3. Run the unit tests and expect 24/24 passing: npm test
4. Run the linter and expect it to pass: npm run lint
5. Start the app (no `npm install` is needed because there are no dependencies): npm start
   It serves at http://localhost:4174
6. Open http://localhost:4174 in a browser and confirm the dashboard loads with the built-in
   sample data: KPI tiles show non-zero values, the "Executive Summary" shows a risk badge, the
   bar chart renders, and the tables are populated.
7. Test uploading real data: create a CSV with the header
   month,customer,product,forecast,actual
   and a few rows, click "Upload CSV", and confirm the KPIs and narrative update. Reload the page
   and confirm the uploaded data is still there (it is saved in the browser's localStorage).

ACCEPTANCE CRITERIA
- `npm test` prints 24 passing tests, 0 failing.
- `npm run lint` prints "Project structure, sample data, and analytics core all OK."
- The app loads at http://localhost:4174 with the sample data and no console errors.
- Uploading a valid CSV replaces the data, and it persists across a page reload.

TROUBLESHOOTING
- Port 4174 in use: start it on another port with `PORT=5000 npm start`.
- Node too old: install Node 18+ (nvm: `nvm install 22 && nvm use 22`).

OPTIONAL — publish it live on GitHub Pages
- The repo already contains .github/workflows/deploy-pages.yml. GitHub only runs workflows from a
  repository root, so to use it, copy the contents of forecast-actual-ai-explainer/ to the root of
  its own new repository, push to `main`, then enable Settings → Pages → Source: "GitHub Actions".
  The site will deploy automatically. (Netlify/Vercel/Cloudflare Pages also work — set the publish
  directory to `public` with no build command.)

Report back: the test/lint output, that the app loaded, and the URL it is running on.
```

---

## B. Manual setup (for a person)

```bash
# 1. Get the code
git clone https://github.com/Zaufanys/CLAUDE-CODE-SYSTEM-PROMPT1.git
cd CLAUDE-CODE-SYSTEM-PROMPT1
git checkout claude/new-project-repo-e6hrij
cd forecast-actual-ai-explainer

# 2. Check Node (need 18+)
node --version

# 3. Run it (no install needed — zero dependencies)
npm start
# → open http://localhost:4174
```

Verify:

```bash
npm test        # expect 24 passing
npm run lint    # expect "... all OK."
```

## C. Use your own data

Click **Upload CSV** in the app and pick a file shaped like this (header row required):

```csv
month,customer,product,forecast,actual
2026-01,Acme Robotics,Sensor Array,500000,540000
2026-02,Acme Robotics,Sensor Array,520000,505000
2026-01,Blue Ridge Power,Inverter,300000,250000
```

- One row per **customer × product × month**.
- `forecast` and `actual` are plain numbers.
- Your data is saved in your browser and reloaded next time. **Load sample data** clears it.

## D. Deploy it live (optional)

The app is the static `public/` folder. Any static host works:

- **GitHub Pages** — put the project at a repo root (see Section E), push to `main`, then
  **Settings → Pages → Source: GitHub Actions**. The included `deploy-pages.yml` does the rest.
- **Netlify / Vercel / Cloudflare Pages** — publish directory `public`, no build command.
- **Any server** — serve `public/`, or run `npm run build:pages` to stage it into `_site/`.

## E. Make it its own repository (optional)

The project is self-contained, so you can lift it out:

```bash
# from inside forecast-actual-ai-explainer/
cp -r . /path/to/forecast-actual-ai-explainer-standalone
cd /path/to/forecast-actual-ai-explainer-standalone
git init && git add . && git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/forecast-actual-ai-explainer.git
git push -u origin main
```

Once it's at the repo root, the CI (`.github/workflows/ci.yml`) and Pages
(`.github/workflows/deploy-pages.yml`) workflows will run automatically.

## F. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Port 4174 in use` | `PORT=5000 npm start` and open that port |
| `node: command not found` / old version | Install Node 18+ (e.g. `nvm install 22 && nvm use 22`) |
| Blank page | Make sure you opened it via `npm start` (a `file://` open won't load ES modules) |
| Upload rejected | The CSV must have the header `month,customer,product,forecast,actual` |
| Repo clone fails (404/permission) | The repo may be private — authenticate first (`gh auth login` or a token) |
