import asyncio
import json
import websockets

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

async def test_iframe():
    async with websockets.connect(DEVTOOLS_WS, max_size=50_000_000) as ws:
        # 1. Get targets
        await ws.send(json.dumps({"id": 1, "method": "Target.getTargets"}))
        res = json.loads(await ws.recv())
        targets = res.get("result", {}).get("targetInfos", [])

        iframe_targets = [t for t in targets if "usercontent.goog" in t.get("url", "") and t.get("type") == "iframe"]
        print(f"Found {len(iframe_targets)} usercontent iframes:")
        for ifr in iframe_targets:
            tid = ifr["targetId"]
            print(f"Testing iframe: {tid}")
            
            # Attach to target
            await ws.send(json.dumps({
                "id": 2,
                "method": "Target.attachToTarget",
                "params": {"targetId": tid, "flatten": True}
            }))
            attach_res = json.loads(await ws.recv())
            sid = attach_res.get("result", {}).get("sessionId")
            print(f"Attached with sessionId: {sid}")

            # Evaluate inside iframe
            eval_cmd = {
                "id": 3,
                "sessionId": sid,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": "typeof window.Flow !== 'undefined' ? Object.keys(window.Flow) : (typeof Flow !== 'undefined' ? Object.keys(Flow) : 'No Flow found')",
                    "returnByValue": True
                }
            }
            await ws.send(json.dumps(eval_cmd))
            
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == 3:
                    val = resp.get("result", {}).get("result", {}).get("value")
                    print(f"Eval result in {tid}: {val}")
                    break

if __name__ == "__main__":
    asyncio.run(test_iframe())
