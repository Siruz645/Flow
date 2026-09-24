import asyncio
import json
import websockets

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

async def test_attach():
    async with websockets.connect(DEVTOOLS_WS, max_size=50_000_000) as ws:
        # Get targets
        await ws.send(json.dumps({"id": 1, "method": "Target.getTargets"}))
        res = json.loads(await ws.recv())
        targets = res.get("result", {}).get("targetInfos", [])
        
        flow_page = next((t for t in targets if "flow.google.com/project" in t.get("url", "") and "tool" in t.get("url", "")), None)
        print("Flow tool page target:", flow_page)
        
        if flow_page:
            tid = flow_page["targetId"]
            req = {
                "id": 2,
                "method": "Target.attachToTarget",
                "params": {"targetId": tid, "flatten": True}
            }
            await ws.send(json.dumps(req))
            attach_res = json.loads(await ws.recv())
            print("Attach page response:", attach_res)

if __name__ == "__main__":
    asyncio.run(test_attach())
