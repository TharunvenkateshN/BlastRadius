from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os
from typing import Dict, Any, Optional, List
from collections import deque
import asyncio
import difflib
from dotenv import load_dotenv
import json
from github import Github, Auth
from github.GithubException import GithubException
import random
import string

# Load environment variables
load_dotenv()

# Add the parent directory to the path so we can import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.git_clone import clone_repo, cleanup_repo
from app.graph_engine.parser import build_graph

app = FastAPI(title="BlastRadius Backend API")

# Printed once at process boot so it's obvious in the terminal (and via
# GET /api/config below) whether a restart actually picked up code changes —
# a stale --reload-less process silently keeps serving old code otherwise.
_resolved_gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
print(f"[BlastRadius] Boot: using Gemini model '{_resolved_gemini_model}'")


@app.get("/api/config")
def get_config():
    # Masked fingerprint only — enough to confirm which key a running
    # process actually loaded at boot without exposing the secret itself.
    key = os.getenv("GEMINI_API_KEY") or ""
    key_fingerprint = f"...{key[-6:]}" if len(key) >= 6 else "(not set)"
    return {"gemini_model": _resolved_gemini_model, "gemini_api_key_fingerprint": key_fingerprint}

# Setup CORS to allow everything for local testing and Vite frontend
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

# Allow overriding/adding via environment for deployment
if os.getenv("CORS_ORIGINS"):
    origins.extend(os.getenv("CORS_ORIGINS").split(","))
    
# Or just allow all for hackathon ease if preferred:
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for graphs. Key: f"{url}::{include_tests}"
repo_cache: Dict[str, Dict[str, Any]] = {}

def get_or_build_graph(url: str, include_tests: bool) -> Dict[str, Any]:
    cache_key = f"{url}::{include_tests}"
    if cache_key in repo_cache:
        return repo_cache[cache_key]
        
    repo_path = None
    try:
        repo_path = clone_repo(url)
        graph_data = build_graph(repo_path, include_tests=include_tests)
        repo_cache[cache_key] = graph_data
        return graph_data
    finally:
        if repo_path:
            cleanup_repo(repo_path)

@app.get("/api/graph")
async def get_graph(
    url: str = Query(..., description="GitHub repository URL"),
    include_tests: bool = Query(False, description="Include tests directory files")
):
    if not url.startswith("https://github.com/") and not url.startswith("http://github.com/"):
        raise HTTPException(
            status_code=400, 
            detail={"error": "Invalid URL", "message": "Only GitHub URLs are supported currently."}
        )
        
    try:
        return get_or_build_graph(url, include_tests)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "Processing Error", "message": f"Error cloning or parsing repository: {str(e)}"}
        )

@app.get("/api/blast-radius")
async def get_blast_radius(
    repo: str = Query(..., description="GitHub repository URL"),
    node_id: str = Query(..., description="Node ID to calculate blast radius for")
):
    if not repo.startswith("https://github.com/") and not repo.startswith("http://github.com/"):
        raise HTTPException(
            status_code=400, 
            detail={"error": "Invalid URL", "message": "Only GitHub URLs are supported currently."}
        )
        
    try:
        graph_data = get_or_build_graph(repo, include_tests=False)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "Processing Error", "message": f"Error cloning or parsing repository: {str(e)}"}
        )
        
    # Verify node_id exists in the graph
    node_exists = any(n["id"] == node_id for n in graph_data["nodes"])
    if not node_exists:
        raise HTTPException(
            status_code=404, 
            detail={"error": "Node not found", "message": f"Node '{node_id}' does not exist in the graph."}
        )
        
    # Build a reverse adjacency list (to -> [from, from, ...])
    reverse_adj = {}
    for edge in graph_data["edges"]:
        to_node = edge["to"]
        from_node = edge["from"]
        if to_node not in reverse_adj:
            reverse_adj[to_node] = []
        reverse_adj[to_node].append(from_node)
        
    # Breadth-first traversal
    queue = deque([(node_id, 0)])
    visited = {node_id}
    affected = []
    depth_map = {}
    
    while queue:
        current_node, depth = queue.popleft()
        
        if depth > 0:
            affected.append(current_node)
            depth_map[current_node] = depth
            
        for caller in reverse_adj.get(current_node, []):
            if caller not in visited:
                visited.add(caller)
                queue.append((caller, depth + 1))
                
    return {
        "origin": node_id,
        "affected": affected,
        "depth_map": depth_map
    }

class MigrateRequest(BaseModel):
    node_id: str
    repo: str
    force_bad_migration: bool = False
    skip_llm_for_test: bool = False

# Active websocket connections for migration tasks
# In a real app, you'd use a more robust task management/message queue system
migration_tasks: Dict[str, asyncio.Event] = {}
migration_data: Dict[str, Dict[str, Any]] = {}

@app.post("/api/migrate")
async def start_migration(req: MigrateRequest):
    if not req.repo.startswith("https://github.com/") and not req.repo.startswith("http://github.com/"):
        raise HTTPException(
            status_code=400, 
            detail={"error": "Invalid URL", "message": "Only GitHub URLs are supported currently."}
        )
    
    # Pre-fetch the graph and ensure node exists
    try:
        graph_data = get_or_build_graph(req.repo, include_tests=False)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "Processing Error", "message": f"Error cloning or parsing repository: {str(e)}"}
        )
        
    node = next((n for n in graph_data["nodes"] if n["id"] == req.node_id), None)
    if not node:
        raise HTTPException(
            status_code=404, 
            detail={"error": "Node not found", "message": f"Node '{req.node_id}' does not exist in the graph."}
        )
        
    if not node.get("source"):
        raise HTTPException(
            status_code=400, 
            detail={"error": "Source missing", "message": "Source code not available for this node."}
        )

    # Store data for the websocket to pick up
    task_id = f"{req.repo}::{req.node_id}"
    migration_tasks[task_id] = asyncio.Event()
    migration_data[task_id] = {
        "repo": req.repo,
        "node_id": req.node_id,
        "source": node["source"],
        "force_bad_migration": req.force_bad_migration,
        "skip_llm_for_test": req.skip_llm_for_test
    }
    
    return {"status": "started", "task_id": task_id}

@app.websocket("/ws/migrate/{node_id:path}")
async def websocket_migrate(websocket: WebSocket, node_id: str, repo: str = Query(...)):
    await websocket.accept()
    
    task_id = f"{repo}::{node_id}"
    
    if task_id not in migration_data:
        await websocket.send_json({"stage": "init", "status": "error", "message": "Migration task not found. Call POST /api/migrate first."})
        await websocket.close()
        return
        
    force_bad = migration_data[task_id].get("force_bad_migration", False)
    skip_llm = migration_data[task_id].get("skip_llm_for_test", False)
    
    # Only allow forcing bad migration if debug mode is active
    debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
    if force_bad and not debug_mode:
        force_bad = False
    if skip_llm and not debug_mode:
        skip_llm = False
    source_code = migration_data[task_id]["source"]
    
    try:
        # Phase 1: Propose
        await websocket.send_json({"stage": "propose", "status": "running"})
        
        # Check API key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            await websocket.send_json({
                "stage": "propose", 
                "status": "error", 
                "message": "GEMINI_API_KEY environment variable is not set."
            })
            await websocket.close()
            return
            
        # Call Gemini
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            
            prompt = (
                "You are refactoring or migrating a single function as part of a larger codebase modernization. "
                "You are given one function's current source code. "
                "Produce an improved/migrated version that preserves the function's existing behavior exactly, unless the user's instructions say otherwise. "
                "Return ONLY the new function code, no explanation, no markdown fences."
            )
            
            if force_bad:
                 new_code = "def make_str(value):\n    if isinstance(value, bytes):\n        return value.decode('utf-8')\n    return str(value) + '_SABOTAGED'\n"
            elif skip_llm:
                 new_code = source_code # Just use the exact same code to guarantee it passes
            else:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=_resolved_gemini_model,
                        contents=[prompt, source_code],
                    ),
                    timeout=45,
                )

                new_code = response.text.strip()
                
                # Remove markdown fences if the model still added them
                if new_code.startswith("```python"):
                    new_code = new_code[9:]
                elif new_code.startswith("```"):
                    new_code = new_code[3:]
                if new_code.endswith("```"):
                    new_code = new_code[:-3]
                new_code = new_code.strip()
            
            # Compute unified diff
            diff_lines = list(difflib.unified_diff(
                source_code.splitlines(keepends=True),
                new_code.splitlines(keepends=True),
                fromfile='old_code.py',
                tofile='new_code.py'
            ))
            diff_text = "".join(diff_lines)
            
            await websocket.send_json({
                "stage": "propose",
                "status": "done",
                "diff": diff_text,
                "old_code": source_code,
                "new_code": new_code
            })
            
        except Exception as e:
             await websocket.send_json({
                "stage": "propose",
                "status": "error",
                "message": f"Gemini API error: {str(e)}"
            })
             return # Stop pipeline on error

        # Phase 2: Verify
        await websocket.send_json({"stage": "verify", "status": "running", "step": "generating_inputs"})
        
        try:
            if force_bad or skip_llm:
                 test_inputs = [{"args": [1, 2], "kwargs": {}, "mock_self": None}]
            else:
                prompt = (
                    f"You are a test input generator. "
                    f"Given this Python function, generate 3 representative, realistic test cases.\n"
                    f"Return ONLY a JSON list of dictionaries. Each dictionary must have:\n"
                    f" - 'args': list of positional arguments (excluding 'self')\n"
                    f" - 'kwargs': dict of keyword arguments\n"
                    f" - 'mock_self': dict of instance attributes (ONLY if this is a method that requires 'self', otherwise null. Check the signature!).\n\n"
                    f"Example for `def add(a, b):`: `[{{\"args\": [1, 2], \"kwargs\": {{}}, \"mock_self\": null}}]`\n"
                    f"Example for `def format_eta(self):`: `[{{\"args\": [], \"kwargs\": {{}}, \"mock_self\": {{\"eta_known\": True, \"eta\": 3600}}}}]`\n\n"
                    f"Source code:\n{source_code}"
                )
                
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=_resolved_gemini_model,
                        contents=[prompt],
                    ),
                    timeout=45,
                )

                inputs_text = response.text.strip()
                if inputs_text.startswith("```json"):
                     inputs_text = inputs_text[7:]
                elif inputs_text.startswith("```"):
                     inputs_text = inputs_text[3:]
                if inputs_text.endswith("```"):
                     inputs_text = inputs_text[:-3]
                
                test_inputs = json.loads(inputs_text.strip())
                if not isinstance(test_inputs, list):
                    test_inputs = [[]] # Fallback
                
        except Exception as e:
             await websocket.send_json({
                "stage": "verify",
                "status": "error",
                "message": f"Failed to generate test inputs: {str(e)}"
            })
             return
             
        # Run tests
        all_passed = True
        failed_reasons = []
        
        func_name = node_id.split(":")[-1]
        
        for i, tc in enumerate(test_inputs):
             await websocket.send_json({"stage": "verify", "status": "running", "test_index": i, "total": len(test_inputs)})
             
             try:
                 old_result = None
                 old_error = None
                 new_result = None
                 new_error = None
                 
                 args = tc.get("args", []) if isinstance(tc, dict) else tc
                 kwargs = tc.get("kwargs", {}) if isinstance(tc, dict) else {}
                 mock_self_data = tc.get("mock_self") if isinstance(tc, dict) else None
                 
                 class MockSelf:
                     def __init__(self, **kw):
                         self.__dict__.update(kw)
                 
                 # Prepare safe execution environment (restricted globals)
                 
                 # Common imports and stubs needed for basic functions like echo to not crash
                 # on simple missing names if they aren't fully self-contained.
                 # The LLM test generator uses ast.get_source_segment which might just grab
                 # the function but lack imports like 'sys', 't', 'typing', etc.
                 # In a true sandbox, we'd include module globals, but here we provide a dummy dict.
                 
                 import sys
                 class DummyContext:
                     pass
                     
                 safe_globals = {
                     "__builtins__": __builtins__,
                     "sys": sys,
                     "t": DummyContext(), 
                     "t.cast": lambda x, y: y,
                     "t.IO": Any,
                     "t.Any": Any,
                 }
                 
                 # Exec old code
                 old_locals = {}
                 try:
                     exec(source_code, safe_globals, old_locals)
                     if func_name in old_locals:
                         if mock_self_data is not None:
                             instance = MockSelf(**mock_self_data)
                             old_result = old_locals[func_name](instance, *args, **kwargs)
                         else:
                             old_result = old_locals[func_name](*args, **kwargs)
                     else:
                         old_error = "Function not found in old code"
                 except Exception as exc:
                     old_error = type(exc).__name__ + ": " + str(exc)
                     
                 # Exec new code
                 new_locals = {}
                 try:
                     exec(new_code, safe_globals, new_locals)
                     if func_name in new_locals:
                         if mock_self_data is not None:
                             instance = MockSelf(**mock_self_data)
                             new_result = new_locals[func_name](instance, *args, **kwargs)
                         else:
                             new_result = new_locals[func_name](*args, **kwargs)
                     else:
                         new_error = "Function not found in new code"
                 except Exception as exc:
                     new_error = type(exc).__name__ + ": " + str(exc)
                     
                 # Compare results
                 if old_error or new_error:
                     if old_error == new_error:
                         outcome = "matched_exception"
                         passed = True
                     else:
                         outcome = "mismatch"
                         passed = False
                 else:
                     if old_result == new_result:
                         outcome = "matched_success"
                         passed = True
                     else:
                         outcome = "mismatch"
                         passed = False
                     
                 if not passed:
                     all_passed = False
                     failed_reasons.append(f"Input: {tc} | Old: {old_error or old_result} | New: {new_error or new_result}")
                     
                 await websocket.send_json({
                     "stage": "verify",
                     "status": "done",
                     "test_index": i,
                     "passed": passed,
                     "outcome": outcome,
                     "input": repr(tc),
                     "old_output": repr(old_error or old_result),
                     "new_output": repr(new_error or new_result)
                 })
                 
             except Exception as e:
                 all_passed = False
                 failed_reasons.append(f"Test runner crashed on input {inputs}: {str(e)}")
                 await websocket.send_json({
                     "stage": "verify",
                     "status": "done",
                     "test_index": i,
                     "passed": False,
                     "input": repr(inputs),
                     "old_output": "Error",
                     "new_output": str(e)
                 })
                 
        # Wait for explicit user approval before touching Decide — the only
        # phase with a real side effect (opening a GitHub PR). Verify results
        # are already fully streamed above; this pause is what makes "must
        # not be automatic" literally true rather than a UI-only delay.
        await websocket.send_json({
            "stage": "verify",
            "status": "complete",
            "all_passed": all_passed
        })

        approval = await websocket.receive_json()
        if approval.get("action") != "approve":
            await websocket.send_json({
                "stage": "decide",
                "status": "done",
                "action": "rejected"
            })
            return

        # Phase 3: Decide
        if not all_passed:
             await websocket.send_json({
                 "stage": "decide",
                 "status": "done",
                 "action": "blocked",
                 "reason": "Tests failed: " + "; ".join(failed_reasons)
             })
        else:
             # Try opening a PR
             github_token = os.getenv("GITHUB_TOKEN")
             if not github_token:
                 await websocket.send_json({
                     "stage": "decide",
                     "status": "done",
                     "action": "pr_failed",
                     "diff": diff_text,
                     "reason": "GITHUB_TOKEN environment variable is not set."
                 })
                 return
                 
             try:
                 # Extract owner/repo
                 repo_path = repo.replace("https://github.com/", "").replace("http://github.com/", "")
                 if repo_path.endswith(".git"):
                     repo_path = repo_path[:-4]
                     
                 auth = Auth.Token(github_token)
                 g = Github(auth=auth)
                 
                 gh_repo = g.get_repo(repo_path)
                 
                 # This is a simplification. To actually commit the file, we'd need to:
                 # 1. Get the current file content from the repo
                 # 2. Apply the replacement (replace old_code with new_code)
                 # 3. Create a commit
                 # For the hackathon context, we'll try to just open a PR if we have write access,
                 # but since we're using a public repo (pallets/click), we likely don't have write access.
                 # To test the happy path, we'll simulate the PR creation if we don't have write access.
                 
                 try:
                     # Check if we can push (this will throw if we don't have permissions)
                     # gh_repo.get_collaborator_permission(g.get_user().login)
                     
                     # Generate a branch name
                     rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
                     branch_name = f"refactor-{func_name}-{rand_suffix}"
                     
                     # Get default branch SHA
                     default_branch = gh_repo.default_branch
                     ref = gh_repo.get_git_ref(f"heads/{default_branch}")
                     
                     # We skip actually committing the file because AST replacement requires knowing the exact
                     # file layout which is complex without a full syntax tree mutator. 
                     # Instead, we just attempt to create a branch to prove the GitHub API works.
                     # (In a real scenario, you'd apply the diff and commit).
                     gh_repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=ref.object.sha)
                     
                     # To avoid empty commit PR failures, we'll fetch the target file,
                     # inject our new code, and push the actual change using the Github API.
                     # We find the file path from the node_id
                     file_path = node_id.split(":")[0]
                     try:
                         # Get the file contents
                         file_content = gh_repo.get_contents(file_path, ref=default_branch)
                         decoded_content = file_content.decoded_content.decode('utf-8')
                         
                         # Very basic replacement (assuming the source string is uniquely present)
                         updated_content = decoded_content.replace(source_code, new_code)
                         
                         # If replace didn't work (e.g. whitespace issues), we fallback
                         if updated_content == decoded_content:
                             raise Exception("Could not strictly match old code in source file to replace it")
                             
                         # Create commit with the updated file
                         gh_repo.update_file(
                             path=file_content.path,
                             message=f"Refactor {func_name}",
                             content=updated_content,
                             sha=file_content.sha,
                             branch=branch_name
                         )
                     except Exception as file_e:
                         # If we can't reliably update the file via API, we'll just fail gracefully
                         # for the hackathon rather than pushing a broken PR.
                         await websocket.send_json({
                             "stage": "decide",
                             "status": "done",
                             "action": "pr_failed",
                             "diff": diff_text,
                             "reason": f"Could not apply code update via GitHub API: {str(file_e)}"
                         })
                         return
                     
                     pr = gh_repo.create_pull(
                         title=f"Refactor {func_name}",
                         body=f"Automated refactoring of `{func_name}`.\n\n```diff\n{diff_text}\n```",
                         head=branch_name,
                         base=default_branch
                     )
                     
                     await websocket.send_json({
                         "stage": "decide",
                         "status": "done",
                         "action": "pr_opened",
                         "pr_url": pr.html_url
                     })
                     
                 except GithubException as ge:
                     # Fallback if we don't have permissions (like against pallets/click)
                     if ge.status in [403, 404]:
                         await websocket.send_json({
                             "stage": "decide",
                             "status": "done",
                             "action": "pr_failed",
                             "diff": diff_text,
                             "reason": f"GitHub API permission denied (likely missing write access to {repo_path})."
                         })
                     else:
                         raise
                         
             except Exception as e:
                 await websocket.send_json({
                     "stage": "decide",
                     "status": "done",
                     "action": "pr_failed",
                     "diff": diff_text,
                     "reason": f"GitHub API error: {str(e)}"
                 })
                 
    except WebSocketDisconnect:
        print(f"Client disconnected for task {task_id}")
    finally:
        # Cleanup
        if task_id in migration_data:
            del migration_data[task_id]
        if task_id in migration_tasks:
            del migration_tasks[task_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
