import ast
import os
from typing import Dict, List, Set, Any
from pathlib import Path

class GraphBuilder(ast.NodeVisitor):
    def __init__(self, file_path: str, repo_root: str, content: str):
        self.file_path = file_path
        self.repo_root = repo_root
        self.content = content
        self.relative_file = os.path.relpath(file_path, repo_root).replace('\\', '/')
        self.nodes = []
        self.edges = []
        
        # Add the module node
        self.module_id = f"{self.relative_file}:<module>"
        self.nodes.append({
            "id": self.module_id,
            "name": "<module>",
            "file": self.relative_file,
            "type": "module",
            "source": content
        })
        
        self.current_scope_id = self.module_id
        
    def visit_FunctionDef(self, node):
        func_id = f"{self.relative_file}:{node.name}"
        # Extract source code for this node
        source_code = ast.get_source_segment(self.content, node)
        
        self.nodes.append({
            "id": func_id,
            "name": node.name,
            "file": self.relative_file,
            "type": "function",
            "source": source_code
        })
        
        # Edge from parent scope to this function (definition)
        # self.edges.append({
        #     "from": self.current_scope_id,
        #     "to": func_id,
        #     "type": "define"
        # })
        
        prev_scope = self.current_scope_id
        self.current_scope_id = func_id
        self.generic_visit(node)
        self.current_scope_id = prev_scope

    def visit_ClassDef(self, node):
        class_id = f"{self.relative_file}:{node.name}"
        source_code = ast.get_source_segment(self.content, node)
        self.nodes.append({
            "id": class_id,
            "name": node.name,
            "file": self.relative_file,
            "type": "class",
            "source": source_code
        })
        
        prev_scope = self.current_scope_id
        self.current_scope_id = class_id
        
        # We need to distinguish methods from regular functions later, 
        # but for simplicity we just traverse them here.
        # Could customize visit_FunctionDef to check if parent is ClassDef.
        
        self.generic_visit(node)
        self.current_scope_id = prev_scope
        
    def visit_Call(self, node):
        # Very simplistic call detection, doesn't resolve types or imports properly across files
        call_name = "unknown"
        if isinstance(node.func, ast.Name):
            call_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            call_name = node.func.attr
            
        # We create a placeholder node for external calls if we can't resolve it,
        # or just point to it by name. Since we don't have a full symbol table,
        # we'll just use the name as ID.
        target_id = f"unknown:{call_name}"
        
        self.edges.append({
            "from": self.current_scope_id,
            "to": target_id, # This is a weak link without full resolution
            "type": "call",
            "name": call_name
        })
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            target_id = f"import:{alias.name}"
            self.edges.append({
                "from": self.current_scope_id,
                "to": target_id,
                "type": "import"
            })
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        module = node.module if node.module else ""
        for alias in node.names:
            target_id = f"import:{module}.{alias.name}"
            self.edges.append({
                "from": self.current_scope_id,
                "to": target_id,
                "type": "import"
            })
        self.generic_visit(node)

def build_graph(repo_path: str, include_tests: bool = False) -> Dict[str, List[Dict[str, Any]]]:
    """
    Walks a repository and builds a dependency/call graph.
    """
    all_nodes = []
    all_edges = []
    
    # First pass: collect all defined nodes
    python_files = []
    for root, _, files in os.walk(repo_path):
        # Optional: check if root contains tests/typing
        parts = Path(root).parts
        if not include_tests:
            if any(p in ('test', 'tests', 'typing') for p in parts):
                continue
                
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
                
    for file_path in python_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            tree = ast.parse(content, filename=file_path)
            builder = GraphBuilder(file_path, repo_path, content)
            builder.visit(tree)
            
            all_nodes.extend(builder.nodes)
            all_edges.extend(builder.edges)
        except SyntaxError:
            print(f"Syntax error in {file_path}, skipping.")
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            
    # Post-processing: try to resolve 'unknown' calls to known nodes if names match
    # This is a very naive resolution
    node_names = {n["name"]: n["id"] for n in all_nodes}
    node_ids = {n["id"] for n in all_nodes}
    
    resolved_edges = []
    for edge in all_edges:
        if edge["type"] == "call" and "unknown:" in edge["to"]:
            call_name = edge.get("name", "")
            if call_name in node_names:
                edge["to"] = node_names[call_name]
                del edge["name"] # cleanup
                resolved_edges.append(edge)
            # If we couldn't resolve it, we just drop it entirely now.
        else:
            if "name" in edge:
                del edge["name"]
            # Only keep edge if 'to' is a known node ID, or if it's an import
            if edge["to"] in node_ids or edge["type"] == "import":
                 resolved_edges.append(edge)
            
    return {
        "nodes": all_nodes,
        "edges": resolved_edges
    }
