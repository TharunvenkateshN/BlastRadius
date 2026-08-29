import asyncio
import websockets
import json
import requests
import threading
import uvicorn
import main
import time
import os
import urllib.parse

# Set a dummy key just so it doesn't fail the key check immediately,
# or we can test the error path if we want.
# os.environ["GEMINI_API_KEY"] = "dummy"

# Run server
def run_server():
    uvicorn.run(main.app, host="127.0.0.1", port=8002, log_level="warning")

server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
time.sleep(3)

repo = "https://github.com/pallets/click"
node_id = "src/click/utils.py:echo"

print("1. Starting migration via POST...")
res = requests.post(
    "http://127.0.0.1:8002/api/migrate", 
    json={"node_id": node_id, "repo": repo}
)
print(f"POST status: {res.status_code}")
if res.status_code != 200:
    print(res.text)
    exit(1)

print("\n2. Connecting to WebSocket...")
async def test_ws():
    uri = f"ws://127.0.0.1:8002/ws/migrate/{node_id}?repo={repo}"
    async with websockets.connect(uri) as ws:
        while True:
            try:
                message = await ws.recv()
                data = json.loads(message)
                print(f"\nReceived event for stage: {data.get('stage')}, status: {data.get('status')}")
                if 'message' in data:
                    print(f"Message: {data['message']}")
                if 'diff' in data:
                    print(f"Diff length: {len(data['diff'])} chars")
                    print("First few lines of diff:")
                    print('\n'.join(data['diff'].split('\n')[:5]))
                
                if data.get('stage') == 'decide':
                    break
            except websockets.exceptions.ConnectionClosed:
                print("Connection closed")
                break

asyncio.run(test_ws())
