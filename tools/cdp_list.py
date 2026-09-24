import asyncio
import json
import websockets

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

async def list_targets():
    async with websockets.connect(DEVTOOLS_WS) as ws:
        req = {
            "id": 1,
            "method": "Target.getTargets"
        }
        await ws.send(json.dumps(req))
        res = await ws.recv()
        data = json.loads(res)
        targets = data.get("result", {}).get("targetInfos", [])
        print(f"Total targets: {len(targets)}")
        for t in targets:
            url = t.get("url", "")
            if "flow.google" in url or "5173" in url or "usercontent.goog" in url or "labs.google" in url:
                print(f"[{t.get('type')}] ID: {t.get('targetId')} | Title: {t.get('title')} | URL: {url}")

if __name__ == "__main__":
    asyncio.run(list_targets())
