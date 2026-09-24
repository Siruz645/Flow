import asyncio
import json
import websockets
import time

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

async def test_persistent():
    print(f"[{time.strftime('%H:%M:%S')}] Connecting to DevTools with 60s timeout...")
    try:
        async with websockets.connect(DEVTOOLS_WS, max_size=100_000_000, open_timeout=60) as ws:
            print(f"[{time.strftime('%H:%M:%S')}] CONNECTED TO OPERA DEVTOOLS SUCCESSFULLY!")
            
            # Send Target.getTargets
            await ws.send(json.dumps({"id": 1, "method": "Target.getTargets"}))
            res = json.loads(await ws.recv())
            targets = res.get("result", {}).get("targetInfos", [])
            print(f"[{time.strftime('%H:%M:%S')}] Got {len(targets)} targets from Opera.")
            
            flow_pages = [t for t in targets if "flow.google" in t.get("url", "")]
            print(f"Flow pages ({len(flow_pages)}):")
            for fp in flow_pages:
                print(f"  - {fp.get('type')}: {fp.get('title')} -> {fp.get('url')[:80]}")
                
            iframes = [t for t in targets if "usercontent.goog" in t.get("url", "")]
            print(f"Usercontent iframes ({len(iframes)}):")
            for ifr in iframes:
                print(f"  - {ifr.get('type')}: {ifr.get('title')} -> {ifr.get('url')[:80]}")
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_persistent())
