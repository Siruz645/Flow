import asyncio
import json
import websockets

DEVTOOLS_WS = "ws://127.0.0.1:9222/devtools/browser/f0a39f61-c72a-4350-b5e0-3a9ba9a36c47"

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.sessions = {}
        self.listen_task = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=100_000_000)
        self.listen_task = asyncio.create_task(self._listen())

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                # Check if it's a response to an id
                if "id" in msg and msg["id"] in self.pending:
                    fut = self.pending.pop(msg["id"])
                    if not fut.done():
                        fut.set_result(msg)
                # Check for Target.attachedToTarget
                if msg.get("method") == "Target.attachedToTarget":
                    p = msg.get("params", {})
                    sid = p.get("sessionId")
                    tid = p.get("targetInfo", {}).get("targetId")
                    self.sessions[tid] = sid
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"CDP listener error: {e}")

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

async def test():
    client = CDPClient(DEVTOOLS_WS)
    await client.connect()
    
    # 1. Get targets
    res = await client.send("Target.getTargets")
    targets = res.get("result", {}).get("targetInfos", [])
    print(f"Targets found: {len(targets)}")
    
    # Find Flow page
    flow_page = next((t for t in targets if "flow.google.com/project" in t.get("url", "") and "tool" in t.get("url", "")), None)
    if not flow_page:
        print("Flow page not found!")
        await client.close()
        return

    print("Found Flow page target:", flow_page["targetId"])
    
    # Attach to Flow page
    attach_res = await client.send("Target.attachToTarget", {"targetId": flow_page["targetId"], "flatten": True})
    page_session = attach_res.get("result", {}).get("sessionId")
    print("Page session ID:", page_session)

    # Let's inspect Page title and frames
    doc_res = await client.send("Runtime.evaluate", {
        "expression": "document.title",
        "returnByValue": True
    }, session_id=page_session)
    print("Page title via evaluate:", doc_res.get("result", {}).get("result", {}).get("value"))

    # Let's check iframe targets
    iframe_targets = [t for t in targets if "usercontent.goog" in t.get("url", "")]
    print(f"Usercontent iframes: {len(iframe_targets)}")
    for ifr in iframe_targets:
        itid = ifr["targetId"]
        i_url = ifr.get("url", "")
        print(f"\n--- Checking iframe {itid} ({ifr.get('type')}) ---")
        print(f"URL: {i_url[:90]}")
        i_attach = await client.send("Target.attachToTarget", {"targetId": itid, "flatten": True})
        i_sid = i_attach.get("result", {}).get("sessionId")
        print("Iframe session ID:", i_sid)
        
        # Test evaluate in iframe
        eval_res = await client.send("Runtime.evaluate", {
            "expression": """
                ({
                    url: window.location.href,
                    hasFlow: typeof window.Flow !== 'undefined',
                    flowKeys: typeof window.Flow !== 'undefined' ? Object.keys(window.Flow) : [],
                    hasWindowFlowGenerate: typeof window.Flow !== 'undefined' && typeof window.Flow.generate !== 'undefined',
                    documentTitle: document.title,
                    bodyLength: document.body ? document.body.innerHTML.length : 0
                })
            """,
            "returnByValue": True
        }, session_id=i_sid)
        print("Eval in iframe:", json.dumps(eval_res.get("result", {}).get("result", {}).get("value"), indent=2))

    await client.close()

if __name__ == "__main__":
    asyncio.run(test())
