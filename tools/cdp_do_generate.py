import asyncio
import json
import websockets
import base64
from pathlib import Path
import time

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"
OUTPUT_FILE = Path(r"c:\Users\siruz\OneDrive\Project\Flow\output.png")

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.listen_task = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=150_000_000, open_timeout=60)
        self.listen_task = asyncio.create_task(self._listen())

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if "id" in msg and msg["id"] in self.pending:
                    fut = self.pending.pop(msg["id"])
                    if not fut.done():
                        fut.set_result(msg)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"CDP listener exception: {e}")

    async def send(self, method, params=None, session_id=None):
        self.msg_id += 1
        mid = self.msg_id
        req = {"id": mid, "method": method}
        if params:
            req["params"] = params
        if session_id:
            req["sessionId"] = session_id
        fut = asyncio.get_running_loop().create_future()
        self.pending[mid] = fut
        await self.ws.send(json.dumps(req))
        return await fut

    async def close(self):
        if self.listen_task:
            self.listen_task.cancel()
        if self.ws:
            await self.ws.close()

async def generate():
    print(f"[{time.strftime('%H:%M:%S')}] Connecting to Opera DevTools...")
    client = CDPClient(DEVTOOLS_WS)
    await client.connect()
    print(f"[{time.strftime('%H:%M:%S')}] Connected!")
    
    # 1. Get targets
    targets_res = await client.send("Target.getTargets")
    targets = targets_res.get("result", {}).get("targetInfos", [])
    
    flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "29q1mdz8j9ll3phnvsdsms63nsrp66hrp3o4u1clutl2pcor7v" in t.get("url", "")), None)
    if not flow_app_target:
        flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", "") and "Compiler" not in t.get("title", "")), None)

    print(f"[{time.strftime('%H:%M:%S')}] Target: {flow_app_target['targetId']}")
    
    attach = await client.send("Target.attachToTarget", {"targetId": flow_app_target["targetId"], "flatten": True})
    sid = attach.get("result", {}).get("sessionId")
    print(f"[{time.strftime('%H:%M:%S')}] Session: {sid}")
    
    # 2. Trigger generation
    prompt = "A cute fluffy red panda sitting on a mossy branch in sunlight, photorealistic 8k"
    print(f"[{time.strftime('%H:%M:%S')}] Triggering Flow.generate.image: '{prompt}'...")
    
    gen_code = f"""
        (async () => {{
            try {{
                const {{ Flow }} = await import('flow-sdk');
                console.log('[Runner CDP] Invoking Flow.generate.image...');
                const res = await Flow.generate.image({{
                    prompt: {json.dumps(prompt)},
                    aspectRatio: '1:1',
                    modelDisplayName: '🍌 Nano Banana Pro'
                }});
                console.log('[Runner CDP] Success, mediaId:', res.mediaId);
                return {{
                    success: true,
                    mediaId: res.mediaId,
                    mimeType: res.mimeType,
                    base64: res.base64
                }};
            }} catch (err) {{
                console.error('[Runner CDP] Error:', err);
                return {{
                    success: false,
                    error: err.message || String(err)
                }};
            }}
        }})()
    """
    
    t0 = time.time()
    res = await client.send("Runtime.evaluate", {
        "expression": gen_code,
        "awaitPromise": True,
        "returnByValue": True,
        "timeout": 120000
    }, session_id=sid)
    
    dur = round(time.time() - t0, 2)
    val = res.get("result", {}).get("result", {}).get("value", {})
    print(f"[{time.strftime('%H:%M:%S')}] Generation finished in {dur}s: success={val.get('success')}")
    
    if not val.get("success"):
        print(f"Error from Flow: {val.get('error')}")
        await client.close()
        return False
        
    b64 = val.get("base64")
    media_id = val.get("mediaId")
    mime = val.get("mimeType", "image/png")
    print(f"MediaId: {media_id}, MimeType: {mime}, Base64 length: {len(b64) if b64 else 0}")
    
    if b64:
        img_bytes = base64.b64decode(b64)
        OUTPUT_FILE.write_bytes(img_bytes)
        print(f"🎉 Saved {len(img_bytes)} bytes to {OUTPUT_FILE}!")
        await client.close()
        return True
    else:
        print("No base64 returned!")
        await client.close()
        return False

if __name__ == "__main__":
    success = asyncio.run(generate())
    sys.exit(0 if success else 1)
