import asyncio
import json
import websockets
import sys

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.listen_task = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=100_000_000, open_timeout=60)
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
            print(f"CDP listener error: {e}", file=sys.stderr)

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

async def main():
    client = CDPClient(DEVTOOLS_WS)
    await client.connect()
    
    # 1. Get targets
    targets_res = await client.send("Target.getTargets")
    targets = targets_res.get("result", {}).get("targetInfos", [])
    
    flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "29q1mdz8j9ll3phnvsdsms63nsrp66hrp3o4u1clutl2pcor7v" in t.get("url", "")), None)
    if not flow_app_target:
        flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", "") and "Compiler" not in t.get("title", "")), None)

    print("Found Flow App iframe target:", flow_app_target["targetId"])
    
    # Attach to iframe
    attach = await client.send("Target.attachToTarget", {"targetId": flow_app_target["targetId"], "flatten": True})
    sid = attach.get("result", {}).get("sessionId")
    print("Session ID for iframe:", sid)
    
    # Evaluate dynamic import of flow-sdk inside the iframe
    test_sdk_code = """
        (async () => {
            try {
                const sdk = await import('flow-sdk');
                return {
                    success: true,
                    keys: Object.keys(sdk),
                    hasFlow: !!sdk.Flow,
                    flowKeys: sdk.Flow ? Object.keys(sdk.Flow) : []
                };
            } catch (e) {
                return {
                    success: false,
                    error: e.message
                };
            }
        })()
    """
    eval_res = await client.send("Runtime.evaluate", {
        "expression": test_sdk_code,
        "awaitPromise": True,
        "returnByValue": True
    }, session_id=sid)
    
    print("Test import('flow-sdk') result:")
    print(json.dumps(eval_res.get("result", {}).get("result", {}).get("value"), indent=2))
    
    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
