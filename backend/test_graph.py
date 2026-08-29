from app.ingestion.git_clone import clone_repo, cleanup_repo
from app.graph_engine.parser import build_graph
import json

repo_path = None
try:
    repo_path = clone_repo("https://github.com/pallets/click")
    graph_data = build_graph(repo_path, include_tests=False)
    
    nodes = graph_data['nodes']
    edges = graph_data['edges']
    
    print(f"Node count: {len(nodes)}")
    print(f"Edge count: {len(edges)}")
    
    test_files = [n for n in nodes if 'test' in n['file'] or 'tests' in n['file'] or 'typing' in n['file']]
    print(f"Nodes in test/typing directories: {len(test_files)}")
    
    unknown_edges = [e for e in edges if e['to'].startswith('unknown:')]
    print(f"Edges pointing to unknown: {len(unknown_edges)}")
    
    print("Graph built successfully.")
finally:
    if repo_path:
        cleanup_repo(repo_path)
