from app.ingestion.git_clone import clone_repo, cleanup_repo
from app.graph_engine.parser import build_graph

repo_path = None
try:
    repo_path = clone_repo("https://github.com/pallets/click")
    graph_data = build_graph(repo_path, include_tests=False)
    
    nodes = graph_data['nodes']
    
    # Check specifically for test/tests/typing directories, not just substrings in filename
    # e.g., we want to exclude 'tests/foo.py' but keep 'my_test_utils.py' if it's in src/
    test_dir_nodes = [n for n in nodes if any(p in n['file'].split('/') for p in ['test', 'tests', 'typing'])]
    print(f"Nodes in test/tests/typing directories: {len(test_dir_nodes)}")
finally:
    if repo_path:
        cleanup_repo(repo_path)
