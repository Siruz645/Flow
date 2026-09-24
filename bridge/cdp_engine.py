import asyncio
import json
import websockets
from pathlib import Path
import time
import sys

class FlowCDPEngine:
    """
    Persistent Chrome DevTools Protocol engine for Google Flow.
    Maintains a single open connection to Opera GX/Chrome to avoid
    repeated permission prompts and delivers high-performance generation.
    """
    def __init__(self):
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.listen_task = None
        self.session_id = None
        self.target_id = None
        self.ws_url = None

    def _discover_ws_url(self) -> str:
        # Check Opera GX DevToolsActivePort
        active_port_file = Path.home() / "AppData" / "Roaming" / "Opera Software" / "Opera GX Stable" / "DevToolsActivePort"
        if active_port_file.exists():
            lines = active_port_file.read_text(encoding="utf-8").strip().splitlines()
            if len(lines) >= 2:
                port = lines[0].strip()
                path = lines[1].strip()
                return f"ws://127.0.0.1:{port}{path}"
        return "ws://127.0.0.1:9222/devtools/browser"

    async def connect(self, timeout=60):
        if self.ws and not self.ws.closed:
            return True
            
        self.ws_url = self._discover_ws_url()
        print(f"[CDPEngine] Connecting to DevTools: {self.ws_url}")
        try:
            self.ws = await websockets.connect(self.ws_url, max_size=150_000_000, open_timeout=timeout)
            self.listen_task = asyncio.create_task(self._listen())
            print("[CDPEngine] DevTools connection established successfully!")
            return True
        except Exception as e:
            print(f"[CDPEngine] Connection failed: {e}")
            return False

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
            print(f"[CDPEngine] Listener exception: {e}")

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

    async def ensure_app_session(self):
        if not self.ws or self.ws.closed:
            connected = await self.connect()
            if not connected:
                return None

        # Discover Flow app iframe target
        targets_res = await self.send("Target.getTargets")
        targets = targets_res.get("result", {}).get("targetInfos", [])
        
        # Look for the usercontent iframe where document.title is "Flow app"
        candidates = [t for t in targets if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", "")]
        for cand in candidates:
            tid = cand["targetId"]
            attach = await self.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
            sid = attach.get("result", {}).get("sessionId")
            if not sid:
                continue
            try:
                chk = await self.send("Runtime.evaluate", {
                    "expression": "document.title",
                    "returnByValue": True
                }, session_id=sid)
                title = chk.get("result", {}).get("result", {}).get("value", "")
                if title == "Flow app":
                    print(f"[CDPEngine] Found Flow app runner target: {tid} (title: '{title}', sessionId: {sid})")
                    self.target_id = tid
                    self.session_id = sid
                    return self.session_id
            except Exception as e:
                print(f"[CDPEngine] Check candidate {tid} error: {e}")

        # Fallback to last candidate if title check didn't match
        if candidates:
            fallback = candidates[-1]
            tid = fallback["targetId"]
            attach = await self.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
            self.target_id = tid
            self.session_id = attach.get("result", {}).get("sessionId")
            print(f"[CDPEngine] Fallback target: {tid}")
            return self.session_id

        print("[CDPEngine] ⚠️ No Google Flow applet iframe found in browser!")
        return None

    async def generate_image(self, prompt: str, aspect_ratio: str = "1:1", model: str = "Nano Banana 2", reference_base64: str = None, reference_mime_type: str = None, timeout_sec: int = 120):
        sid = await self.ensure_app_session()
        if not sid:
            raise RuntimeError("Google Flow tab or applet iframe is not active in browser")

        js_code = f"""
            (async () => {{
                try {{
                    const {{ Flow }} = await import('flow-sdk');
                    let refIds = [];
                    const refB64 = {json.dumps(reference_base64)};
                    const refMime = {json.dumps(reference_mime_type or "image/png")};
                    if (refB64) {{
                        console.log('[CDP] Uploading reference image for editing...');
                        const uploaded = await Flow.upload({{
                            base64: refB64,
                            mimeType: refMime,
                            name: 'ref_edit_image.png'
                        }});
                        if (uploaded && uploaded.mediaId) {{
                            refIds.push(uploaded.mediaId);
                        }}
                    }}

                    const genOpts = {{
                        prompt: {json.dumps(prompt)},
                        aspectRatio: {json.dumps(aspect_ratio)},
                        modelDisplayName: {json.dumps(model)}
                    }};
                    if (refIds.length > 0) {{
                        genOpts.referenceImageMediaIds = refIds;
                    }}

                    console.log('[CDP] Flow.generate.image opts:', JSON.stringify(genOpts));
                    const res = await Flow.generate.image(genOpts);
                    return {{
                        success: true,
                        mediaId: res.mediaId,
                        mimeType: res.mimeType || 'image/jpeg',
                        base64: res.base64
                    }};
                }} catch (err) {{
                    return {{
                        success: false,
                        error: err.message || String(err)
                    }};
                }}
            }})()
        """
        
        print(f"[CDPEngine] 🎨 Executing Flow.generate.image: '{prompt[:40]}...' (model: {model}, ratio: {aspect_ratio}, has_ref: {bool(reference_base64)})")
        res = await self.send("Runtime.evaluate", {
            "expression": js_code,
            "awaitPromise": True,
            "returnByValue": True,
            "timeout": timeout_sec * 1000
        }, session_id=sid)

        val = res.get("result", {}).get("result", {}).get("value", {})
        if not val.get("success"):
            err_msg = val.get("error", "Unknown error in Flow runner")
            raise RuntimeError(f"Flow generation failed: {err_msg}")

        return {
            "status": "success",
            "mediaId": val.get("mediaId"),
            "mimeType": val.get("mimeType", "image/jpeg"),
            "base64": val.get("base64")
        }

    async def close(self):
        if self.listen_task:
            self.listen_task.cancel()
        if self.ws:
            await self.ws.close()
