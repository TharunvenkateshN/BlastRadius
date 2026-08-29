# Blast Radius Backend

The Blast Radius backend is a FastAPI application that intelligently analyzes Python repositories, computes the dependency graph of function calls, and executes an automated, agentic code-migration pipeline (Propose → Verify → Decide).

## Features

- **Ingestion & Graph Engine**: Clones remote GitHub repositories to a secure temporary namespace, parses Python files into an Abstract Syntax Tree (AST), and builds a deterministic dependency/call graph.
- **Blast Radius Calculation**: Determines the full upstream dependency chain (breadth-first traversal) for any given function or class to quantify the risk of a refactoring.
- **Agent Pipeline**: Executes a WebSocket-driven refactoring pipeline:
  - **Propose**: Uses Google's Gemini GenAI models to refactor code while maintaining exact functionality.
  - **Verify**: Uses GenAI to generate realistic test inputs, then executes both the *old* and *new* code in an isolated environment to ensure the execution paths perfectly match (whether success or identical exceptions).
  - **Decide**: Automatically forks the branch and opens a Pull Request on the target GitHub repository if and only if all tests pass.

## Setup Instructions

1. Clone this repository and navigate to `backend/`.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Or .\venv\Scripts\Activate.ps1 on Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment template and insert your API keys:
   ```bash
   cp .env.example .env
   ```
   *Note: You must populate `GEMINI_API_KEY` and `GITHUB_TOKEN` (which requires `repo` scope to open Pull Requests).*
5. Run the local server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Endpoints

### 1. `GET /api/graph`
Builds and retrieves the full AST dependency graph for a repository.
- **Query Params**:
  - `url` (string): The GitHub repository URL.
  - `include_tests` (boolean, optional, default `false`): Whether to include files inside `tests/` directories.
- **Response**: `{ "nodes": [...], "edges": [...] }`

### 2. `GET /api/blast-radius`
Calculates the upstream dependency chain for a specific node.
- **Query Params**:
  - `repo` (string): The GitHub repository URL.
  - `node_id` (string): The target function identifier (e.g., `src/main.py:my_function`).
- **Response**: `{ "origin": "<node_id>", "affected": ["<id1>", "<id2>"], "depth_map": { "<id1>": 1, "<id2>": 2 } }`

### 3. `POST /api/migrate`
Initiates a migration task for a specific node, caching the graph and preparing the WebSocket stream.
- **Payload**:
  ```json
  {
    "node_id": "string",
    "repo": "string",
    "force_bad_migration": false,
    "skip_llm_for_test": false
  }
  ```
  *(Note: The test flags `force_bad_migration` and `skip_llm_for_test` are strictly ignored unless `DEBUG_MODE=true` is set in your `.env`.)*
- **Response**: `{ "status": "started", "task_id": "<task_id>" }`

### 4. `WS /ws/migrate/{node_id}`
Connects to the active migration pipeline to stream refactoring events.
- **Query Params**: `repo` (string)
- **Yields**: A stream of JSON objects corresponding to the pipeline's progress:
  - `{"stage": "propose", "status": "running" | "done" | "error", "diff": "..."}`
  - `{"stage": "verify", "status": "running" | "done" | "error", "passed": true, "outcome": "matched_success", "input": "...", "old_output": "...", "new_output": "..."}`
  - `{"stage": "decide", "status": "done", "action": "pr_opened" | "pr_failed" | "blocked", "reason": "...", "pr_url": "..."}`

## Deployment (Docker)

You can build and run this application as a Docker container, suitable for platforms like Render or Railway.

```bash
docker build -t blast-radius-backend .
docker run -p 8000:8000 --env-file .env blast-radius-backend
```
