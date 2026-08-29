from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os
from typing import Dict, Any, Optional
from collections import deque
import asyncio
import difflib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the parent directory to the path so we can import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.git_clone import clone_repo, cleanup_repo
from app.graph_engine.parser import build_graph

app = FastAPI(title="BlastRadius Backend API")

# Setup CORS to allow everything for local testing, including websockets
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported currently.")
        
    try:
        return get_or_build_graph(url, include_tests)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing repository: {str(e)}")

@app.get("/api/blast-radius")
async def get_blast_radius(
    repo: str = Query(..., description="GitHub repository URL"),
    node_id: str = Query(..., description="Node ID to calculate blast radius for")
):
    if not repo.startswith("https://github.com/") and not repo.startswith("http://github.com/"):
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported currently.")
        
    try:
        graph_data = get_or_build_graph(repo, include_tests=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing repository: {str(e)}")
        
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

# Active websocket connections for migration tasks
# In a real app, you'd use a more robust task management/message queue system
migration_tasks: Dict[str, asyncio.Event] = {}
migration_data: Dict[str, Dict[str, Any]] = {}

@app.post("/api/migrate")
async def start_migration(req: MigrateRequest):
    if not req.repo.startswith("https://github.com/") and not req.repo.startswith("http://github.com/"):
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported currently.")
    
    # Pre-fetch the graph and ensure node exists
    try:
        graph_data = get_or_build_graph(req.repo, include_tests=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing repository: {str(e)}")
        
    node = next((n for n in graph_data["nodes"] if n["id"] == req.node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found in graph.")
        
    if not node.get("source"):
        raise HTTPException(status_code=400, detail="Source code not available for this node.")

    # Store data for the websocket to pick up
    task_id = f"{req.repo}::{req.node_id}"
    migration_tasks[task_id] = asyncio.Event()
    migration_data[task_id] = {
        "repo": req.repo,
        "node_id": req.node_id,
        "source": node["source"]
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
            
            response = client.models.generate_content(
                model='gemini-3.1-pro',
                contents=[prompt, source_code],
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
             # Don't close immediately, let client see error
             
        # Phase 2: Verify (Stub)
        await websocket.send_json({"stage": "verify", "status": "stub"})
        
        # Phase 3: Decide (Stub)
        await websocket.send_json({"stage": "decide", "status": "stub"})
        
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
