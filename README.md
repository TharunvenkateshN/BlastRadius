<div align="center">

<br />

```
██████╗ ██╗██████╗ ██████╗ ██╗     ███████╗
██╔══██╗██║██╔══██╗██╔══██╗██║     ██╔════╝
██████╔╝██║██████╔╝██████╔╝██║     █████╗  
██╔══██╗██║██╔═══╝ ██╔═══╝ ██║     ██╔══╝  
██║  ██║██║██║     ██║     ███████╗███████╗
╚═╝  ╚═╝╚═╝╚═╝     ╚═╝     ╚══════╝╚══════╝
```

**Understand the true cost of every code change — before you make it.**

[![BuildSprint 2026](https://img.shields.io/badge/BuildSprint-2026-ff6a3d?style=flat-square)](https://buildsprint.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.11+-3776ab?style=flat-square&logo=python)](https://python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

[Live Demo](https://ripple.vercel.app) · [Watch the 2-minute walkthrough](#demo) · [Quick Start](#quick-start)

</div>

---

## The Problem

When a senior engineer changes a utility function, they do it carefully — not because the change is hard, but because they know it might silently break something three files away. That knowledge lives in their head. For everyone else, it's invisible.

Code review doesn't catch it. Static analysis flags syntax, not semantic blast radius. And when a change does cascade into production, the post-mortem always ends the same way: *"We didn't know it was called from there."*

**Ripple makes that blast radius visible — instantly, and for any engineer.**

---

## What Ripple Does

Ripple ingests any Python GitHub repository, parses its full call and import graph using AST analysis, and gives you an interactive visualization of how every function connects to every other. When you select any function, it lights up every downstream dependent — cascading outward hop by hop — so you know exactly what a change would touch before you write a line of code.

Then, if you want, it goes further: a three-stage AI agent can migrate the selected function (rewrite it, verify it against live tests, and open a real pull request) — all streamed live in the UI.

### Core capabilities

**Graph visualization** — Point Ripple at any public GitHub repo. Within seconds, it parses the codebase and renders an interactive dependency graph. For `pallets/click`, that's 790 nodes and 1,516 edges. The canvas starts with the 15 highest-degree nodes as entry points; you expand the graph by clicking.

**Blast radius analysis** — Click any function node. Ripple traces every path that depends on it — direct callers, their callers, and so on — and reveals them in concentric rings color-coded by hop distance. The `echo` function in `pallets/click` has a blast radius of 106 nodes cascading across 8 hops. You see that in under a second.

**AI migration pipeline** — One click triggers a live three-stage agent:
- **Propose** — Gemini rewrites the function; you see a full diff (old vs. new, line by line)
- **Verify** — Runs the function against real test cases extracted from the repo; each result streams in as it completes
- **Decide** — If all tests pass, it opens a real GitHub pull request and gives you the link. If any test fails, it blocks and explains why.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                          │
│                                                                 │
│   ┌──────────────┐   ┌─────────────────┐   ┌───────────────┐  │
│   │   Sidebar    │   │   GraphCanvas   │   │  Migration    │  │
│   │              │   │                 │   │    Panel      │  │
│   │ • Repo input │   │ • SVG graph     │   │               │  │
│   │ • File tree  │   │ • Radial layout │   │ • Diff viewer │  │
│   │ • Legend     │   │ • Blast rings   │   │ • Test stream │  │
│   │ • Stats      │   │ • Click expand  │   │ • PR link     │  │
│   └──────┬───────┘   └────────┬────────┘   └───────┬───────┘  │
│          │                    │                     │          │
└──────────┼────────────────────┼─────────────────────┼──────────┘
           │         REST + WebSocket                 │
           ▼                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (port 8000)                │
│                                                                  │
│   GET /api/graph          → parse repo AST → return node/edge   │
│   GET /api/blast-radius   → BFS traversal → depth-annotated     │
│   POST /api/migrate       → trigger agent pipeline              │
│   WS  /ws/migrate/{id}    → stream Propose/Verify/Decide events │
│                                                                  │
│   ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐  │
│   │  Ingestion   │   │  Graph Engine │   │  Agent Pipeline  │  │
│   │              │   │               │   │                  │  │
│   │ • Git clone  │   │ • AST walker  │   │ • Propose (LLM)  │  │
│   │ • AST parse  │   │ • BFS/DFS     │   │ • Verify (tests) │  │
│   │ • Edge build │   │ • Depth map   │   │ • Decide (PR)    │  │
│   └──────────────┘   └───────────────┘   └──────────────────┘  │
│                                    │                            │
│                              Gemini API        GitHub API       │
└──────────────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast HMR, simple state model |
| Graph rendering | Plain SVG (no library) | Full layout control, no positioning bugs |
| Backend | FastAPI + Uvicorn | Async-native, WebSocket support built in |
| AST parsing | Python `ast` module | Zero dependency, handles the full Python grammar |
| AI agent | Google Gemini (`gemini-2.0-flash`) | Fast inference, large context window for diffs |
| GitHub integration | PyGithub | PR creation, branch management |
| Styling | CSS custom properties + Space Grotesk / JetBrains Mono | Design-token-driven theming |

---

## How It Works, End to End

### Step 1 — Repo ingestion

When you submit a GitHub URL, the backend clones the repo into a temp directory (or fetches from cache), then walks every `.py` file using Python's `ast` module. It extracts every function definition and traces every call within and across files, resolving imports to build a fully-connected directed graph. The output is a node list (function name, file, type) and an edge list (caller → callee, with relationship type).

**Real numbers:** `pallets/click` produces **790 nodes** and **1,516 edges** in about 4 seconds.

### Step 2 — Blast radius computation

Selecting a node triggers a BFS traversal starting from that node, following edges in the **reverse direction** (i.e., "who calls this?" rather than "what does this call?"). The traversal records the shortest-path hop count for every reachable node, returned as a `depth_map`. This is what drives the staggered ring animation — depth 1 nodes light up first, then depth 2, and so on.

**Real numbers:** `src/click/utils.py:echo` has **106 affected nodes** across **8 hops**.

### Step 3 — AI migration pipeline

Clicking **Migrate** does three things in sequence, streamed live over a WebSocket:

1. **Propose** — The selected function's source code is sent to Gemini with a prompt asking it to migrate the function to a modern, idiomatic pattern. The response is parsed into a structured diff and displayed line-by-line in the panel.

2. **Verify** — The test suite is scanned for tests that exercise the selected function. Each test is run against both the original and the proposed version. Results stream in individually — ✓ for match, ✗ for divergence.

3. **Decide** — If all tests pass, PyGithub creates a branch, commits the new version, and opens a PR. The PR URL appears in the panel as a clickable link. If any test fails, the pipeline is blocked and the reason is shown.

---

## API Reference

All endpoints run at `localhost:8000` in development. Swagger UI is available at `/docs`.

### `GET /api/graph`

Parse a GitHub repository into a node/edge graph.

**Query params:**
- `url` — GitHub repository URL (e.g. `https://github.com/pallets/click`)
- `include_tests` — `boolean`, default `false`. Set to `true` to include test files.

**Response:**
```json
{
  "nodes": [
    { "id": "src/click/utils.py:echo", "name": "echo", "file": "src/click/utils.py", "type": "function" }
  ],
  "edges": [
    { "from": "src/click/core.py:BaseCommand.main", "to": "src/click/utils.py:echo", "type": "call" }
  ]
}
```

---

### `GET /api/blast-radius`

Compute the blast radius of a node — every function that transitively depends on it.

**Query params:**
- `node_id` — The node's full ID (e.g. `src/click/utils.py:echo`)
- `repo` — The same GitHub URL used in `/api/graph`

**Response (200):**
```json
{
  "origin": "src/click/utils.py:echo",
  "affected": ["examples/aliases/aliases.py:push", "src/click/core.py:get_help"],
  "depth_map": {
    "examples/aliases/aliases.py:push": 1,
    "src/click/core.py:get_help": 7
  }
}
```

**Response (404 — node not found):**
```json
{
  "detail": {
    "error": "Node not found",
    "message": "Node 'src/click/utils.py:missing_fn' does not exist in the graph."
  }
}
```

---

### `POST /api/migrate`

Initiate the AI migration pipeline for a function.

**Body:**
```json
{ "node_id": "src/click/utils.py:echo", "repo": "https://github.com/pallets/click" }
```

**Response:** `{ "status": "started" }` — then connect to the WebSocket below.

---

### `WS /ws/migrate/{node_id}`

Streams the pipeline as it runs. `node_id` should be URL-encoded (replace `/` with `%2F`).

**Event types:**

```jsonc
// Propose complete — diff is ready to display
{ "stage": "propose", "status": "done", "diff": "...", "old_code": "...", "new_code": "..." }

// Verify — each test result as it finishes
{ "stage": "verify", "status": "running", "test_index": 1, "total": 12 }
{ "stage": "verify", "status": "done", "test_index": 1, "passed": true, "input": "...", "old_output": "...", "new_output": "..." }

// Decide — final outcome
{ "stage": "decide", "status": "done", "action": "pr_opened", "pr_url": "https://github.com/..." }
{ "stage": "decide", "status": "done", "action": "blocked", "reason": "2 tests failed" }
{ "stage": "decide", "status": "done", "action": "pr_failed", "reason": "GitHub API error" }
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Google AI Studio API key](https://aistudio.google.com/apikey) (Gemini)
- A GitHub personal access token (for the PR-opening step — optional for read-only use)

### 1. Clone and enter the project

```bash
git clone https://github.com/your-org/ripple.git
cd ripple
```

### 2. Start the backend

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
# → Edit .env: add your GEMINI_API_KEY and GITHUB_TOKEN

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
[Ripple] Boot: using Gemini model 'gemini-2.0-flash'
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Verify at [http://localhost:8000/docs](http://localhost:8000/docs) — you should see the Swagger UI listing all four endpoints.

### 3. Start the frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Navigate to [http://localhost:5173](http://localhost:5173).

### 4. Try it immediately

The UI defaults to `https://github.com/pallets/click`. Hit **Analyze**, wait ~4 seconds, then click any node. For the most dramatic result, find `echo` in the `src/click/utils.py` file group in the sidebar — it has a blast radius of 106 nodes.

---

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
# Required — get yours at https://aistudio.google.com/apikey
GEMINI_API_KEY=AIza...

# Required only for the Decide step (PR opening)
GITHUB_TOKEN=ghp_...

# Optional — defaults shown
GEMINI_MODEL=gemini-2.0-flash
CACHE_DIR=.cache
```

---

## Project Structure

```
ripple/
├── backend/
│   ├── main.py                    # FastAPI entrypoint, all routes
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── ingestion/             # Git clone + file discovery
│       ├── graph_engine/
│       │   ├── parser.py          # AST walker — builds node + edge lists
│       │   └── blast_radius.py    # BFS traversal, depth_map computation
│       └── agent/
│           ├── propose.py         # Gemini prompt + diff generation
│           ├── verify.py          # Test extraction + execution
│           └── decide.py          # PR creation via PyGithub
│
├── frontend/
│   └── src/
│       ├── main.jsx               # Router — / → Landing, /app → App
│       ├── App.jsx                # Shell: state + fetch orchestration
│       ├── pages/
│       │   └── Landing.jsx        # Landing page
│       └── components/
│           ├── Sidebar.jsx        # Repo input, file tree, stats, legend
│           ├── GraphCanvas.jsx    # SVG graph — radial layout + blast rings
│           └── MigrationPanel.jsx # Agent pipeline UI + diff/test viewer
│
├── docs/
│   └── graph-contract.md          # Canonical API contract (source of truth)
│
└── README.md
```

---

## Demo

<div align="center">

*(Demo GIF — Ripple analyzing `pallets/click`, selecting `echo`, watching the 106-node blast radius animate, then triggering migration and watching tests stream in live)*

</div>

**The three moments that land in every demo:**

1. **The graph appears** — 790 nodes parsed in 4 seconds. The canvas shows the 15 highest-degree hubs; the sidebar lists every file, grouped and collapsible.

2. **The blast radius cascades** — Click `echo`. Depth-1 dependents light up immediately in amber. Then depth-2, then depth-3 and beyond, fading as they go. The panel shows: *106 nodes · depth 8*.

3. **The agent runs live** — Hit Migrate. The diff appears. Tests start streaming — ✓ ✓ ✓ ✓. The panel resolves: *PR opened ✓* with a real GitHub link.

---

## Design System

Ripple uses a minimal dark theme with a single accent color (ember orange) that carries semantic meaning throughout the UI:

```
--bg:            #0a0e14   Canvas and shell background
--bg-panel:      #10151d   Sidebar and panel surfaces
--ember:         #ff6a3d   Selected node · hot path · primary action
--safe:          #3d7bff   Verified state · passing tests
--warn:          #ffb648   Warning state · blocked migration
--text-primary:  #eef1f5   Body text
--text-secondary:#8f9bab   Labels and metadata
```

Typography: **Space Grotesk** for UI text, **JetBrains Mono** for code, IDs, and stats.

The blast radius color gradient encodes hop distance:
- `#ff8c5f` — depth 1 (direct dependents)
- `#cf7a58` — depth 2
- `#a05a3e` — depth 3+

---

## Known Limitations

- **Python only** — The AST parser targets `.py` files. TypeScript and JavaScript support is planned.
- **Public repos only** — Ripple clones via HTTPS. Private repos require a GitHub token with `repo` scope in `.env`.
- **Large repos are slow on first load** — Repos with 2,000+ files can take 15–20 seconds to parse. Results are cached after the first run.
- **Test extraction is heuristic** — The verify step finds tests by scanning for functions named `test_*` that call the origin function. Parametrized or class-based tests may not be picked up.

---

## Built At

**BuildSprint 2026** — 48-hour hackathon hosted by [Unstop](https://unstop.com).

Built by a team of two, split by layer: backend (ingestion, graph engine, agent pipeline) and frontend (visualization, interaction, demo).

---

<div align="center">

MIT License · Built at BuildSprint 2026

*If a change ripples through your codebase, you should see it before it ships.*

</div>

## Team

Built at BuildSprint 2026 in 48 hours by two engineers from Amrita Vishwa Vidyapeetham, Coimbatore.

| | |
|---|---|
| **Tharun N V** — Backend & Intelligence | **Poornachandran** — Frontend & Experience |
| Graph engine, AST parsing, agent pipeline (Propose → Verify → Decide), FastAPI + WebSocket API | React UI, SVG graph visualization, blast radius animation, migration panel, demo curation |
| [github.com/TharunvenkateshN](https://github.com/TharunvenkateshN)| [github.com/poornachandran2006](https://github.com/poornachandran2006) |
