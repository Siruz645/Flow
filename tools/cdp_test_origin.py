import asyncio
import json
import websockets

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

async def test_iframe():
    headers = [("Host", "127.0.0.1:9222")]
    async with websockets.connect(DEVTOOLS_WS, extra_headers=headers, origin="chrome-devtools://devtools") as ws:
        await ws.send(json.dumps({"id": 1, "method": "Target.getTargets"}))
        res = json.loads(await ws.recv())
        print("Success! Targets count:", len(res.get("result", {}).get("targetInfos", [])))

if __name__ == "__main__":
    asyncio.run(test_iframe())
