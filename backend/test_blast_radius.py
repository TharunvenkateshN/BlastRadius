import requests
import json
import time
from collections import Counter
import threading
import uvicorn
import main

# Function to run the server in a separate thread
def run_server():
    # Use 127.0.0.1 instead of 127.0.0.0
    uvicorn.run(main.app, host="127.0.0.1", port=8001, log_level="warning")

# Start the server thread
server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()

# Wait a moment for server to start
time.sleep(3)

repo_url = "https://github.com/pallets/click"
print("1. Fetching graph to find a popular node...")
response = requests.get(f"http://127.0.0.1:8001/api/graph?url={repo_url}")
graph = response.json()

# Find node with most incoming edges
to_counts = Counter(edge['to'] for edge in graph['edges'])
# Sort and pick the highest one that isn't an import (start with internal functions)
target_node = None
for node_id, count in to_counts.most_common(20):
    if not node_id.startswith("import:"):
        target_node = node_id
        break

print(f"2. Found popular node: {target_node} with {to_counts[target_node]} direct incoming edges")

print(f"\n3. Requesting blast radius for {target_node}...")
start_time = time.time()
br_response = requests.get(f"http://127.0.0.1:8001/api/blast-radius?repo={repo_url}&node_id={target_node}")
elapsed = time.time() - start_time
print(f"Blast radius request took {elapsed:.2f} seconds (should be fast if cached)")

if br_response.status_code == 200:
    br_data = br_response.json()
    affected_count = len(br_data['affected'])
    print(f"\nBlast Radius Result:")
    print(f"Origin: {br_data['origin']}")
    print(f"Total Affected Nodes: {affected_count}")
    
    print("\nSample depth_map entries:")
    # Print a few samples sorted by depth
    sorted_map = sorted(br_data['depth_map'].items(), key=lambda x: x[1])
    for k, v in sorted_map[:5]:
        print(f"  {k}: depth {v}")
    if affected_count > 5:
        print("  ...")
        for k, v in sorted_map[-2:]:
            print(f"  {k}: depth {v}")
else:
    print(f"Failed with status: {br_response.status_code}")
    print(br_response.text)

print("\n4. Testing 404 for invalid node...")
bad_response = requests.get(f"http://127.0.0.1:8001/api/blast-radius?repo={repo_url}&node_id=nonexistent:node")
print(f"Status: {bad_response.status_code}")
print(f"Response: {json.dumps(bad_response.json(), indent=2)}")

