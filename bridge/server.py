import os
import sys
import json
import asyncio
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

# Force UTF-8 on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from watchfiles import awatch, Change

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = BASE_DIR / "src"
SRC_DIR.mkdir(parents=True, exist_ok=True)

try:
    from bridge.cdp_engine import FlowCDPEngine
except ImportError:
    from cdp_engine import FlowCDPEngine

cdp_engine = FlowCDPEngine()

class BridgeManager:
    def __init__(self):
        # Sockets separated by role
        self.flow_tabs: list[WebSocket] = []
        self.local_apps: list[WebSocket] = []
        # Pending generation requests mapped by request ID -> asyncio.Future
        self.pending_requests: Dict[str, asyncio.Future] = {}

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        if role == "flow_tab":
            self.flow_tabs.append(websocket)
            print(f"[Bridge] 🌐 Flow Tab connected (Active tabs: {len(self.flow_tabs)})")
        else:
            self.local_apps.append(websocket)
            print(f"[Bridge] 💻 Local App connected (Active apps: {len(self.local_apps)})")
        await self.broadcast_presence()

    def disconnect(self, websocket: WebSocket):
        if websocket in self.flow_tabs:
            self.flow_tabs.remove(websocket)
            print(f"[Bridge] 🌐 Flow Tab disconnected (Active tabs: {len(self.flow_tabs)})")
        if websocket in self.local_apps:
            self.local_apps.remove(websocket)
            print(f"[Bridge] 💻 Local App disconnected (Active apps: {len(self.local_apps)})")

    async def broadcast_presence(self):
        msg = {
            "event": "presence",
            "flow_tabs_count": len(self.flow_tabs),
            "local_apps_count": len(self.local_apps),
            "is_flow_ready": len(self.flow_tabs) > 0
        }
        await self.broadcast_all(msg)

    async def broadcast_all(self, message: dict):
        all_conns = list(self.flow_tabs + self.local_apps)
        for conn in all_conns:
            try:
                await conn.send_json(message)
            except Exception:
                pass

    async def send_to_flow(self, message: dict) -> bool:
        if not self.flow_tabs:
            return False
        # Send to the most recently active Flow tab
        target = self.flow_tabs[-1]
        try:
            await target.send_json(message)
            return True
        except Exception:
            return False

    async def dispatch_generation_request(self, payload: dict, timeout_seconds: float = 120.0) -> dict:
        req_id = payload.get("id") or f"req-{uuid.uuid4().hex[:8]}"
        payload["id"] = req_id
        if "event" not in payload:
            payload["event"] = "generate_image_req"

        if not self.flow_tabs:
            raise HTTPException(
                status_code=503,
                detail="Вкладка Google Flow не подключена к мосту. Откройте flow.google.com с активным расширением/юзерскриптом."
            )

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_requests[req_id] = future

        print(f"[Bridge] 🚀 Dispatching generation request '{req_id}' (event: {payload['event']}) to Flow Tab...")
        sent = await self.send_to_flow(payload)
        if not sent:
            self.pending_requests.pop(req_id, None)
            raise HTTPException(status_code=500, detail="Не удалось отправить запрос во вкладку Google Flow.")

        try:
            result = await asyncio.wait_for(future, timeout=timeout_seconds)
            return result
        except asyncio.TimeoutError:
            self.pending_requests.pop(req_id, None)
            raise HTTPException(status_code=504, detail=f"Таймаут ожидания генерации от вкладки Flow (превышено {int(timeout_seconds)} сек).")
        finally:
            self.pending_requests.pop(req_id, None)

    def resolve_generation_response(self, payload: dict):
        req_id = payload.get("id")
        if req_id and req_id in self.pending_requests:
            future = self.pending_requests[req_id]
            if not future.done():
                future.set_result(payload)
                print(f"[Bridge] ✅ Generation response received for '{req_id}'")

bridge = BridgeManager()

def read_all_local_files() -> Dict[str, str]:
    files_data = {}
    if not SRC_DIR.exists():
        return files_data
    for file_path in SRC_DIR.rglob("*"):
        if file_path.is_file():
            rel_path = file_path.relative_to(SRC_DIR).as_posix()
            try:
                files_data[rel_path] = file_path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"[Bridge] Error reading {rel_path}: {e}")
    return files_data

async def file_watcher_task():
    """Watches src/ directory for changes and broadcasts to connected Flow UI."""
    print(f"[Bridge] Watching for local file changes in: {SRC_DIR}")
    try:
        async for changes in awatch(SRC_DIR):
            for change_type, path_str in changes:
                path = Path(path_str)
                if path.is_file() or change_type == Change.deleted:
                    try:
                        rel_path = path.relative_to(SRC_DIR).as_posix()
                        content = path.read_text(encoding="utf-8") if change_type != Change.deleted else ""
                        event_type = "file_deleted" if change_type == Change.deleted else "file_changed"
                        print(f"[Bridge] Local edit [{event_type}]: {rel_path} -> Broadcasting to Flow...")
                        await bridge.broadcast_all({
                            "event": event_type,
                            "path": rel_path,
                            "content": content
                        })
                    except Exception as e:
                        print(f"[Bridge] Error processing change for {path_str}: {e}")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[Bridge] Watcher error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    watcher = asyncio.create_task(file_watcher_task())
    cdp_task = asyncio.create_task(cdp_engine.connect(timeout=10))
    yield
    watcher.cancel()
    cdp_task.cancel()
    await cdp_engine.close()

app = FastAPI(title="Google Flow Sync & Generation Bridge", version="2.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/flow_sync.user.js")
async def get_user_script():
    user_script_path = BASE_DIR / "tampermonkey" / "flow_sync.user.js"
    if user_script_path.exists():
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(user_script_path.read_text(encoding="utf-8"), media_type="text/javascript")
    raise HTTPException(status_code=404, detail="Script not found")

@app.get("/status")
@app.get("/api/bridge_status")
async def get_status():
    files = read_all_local_files()
    cdp_ready = cdp_engine.ws is not None and not cdp_engine.ws.closed
    return {
        "status": "ok",
        "version": "2.2.0",
        "src_path": str(SRC_DIR),
        "files_count": len(files),
        "flow_tabs_connected": len(bridge.flow_tabs),
        "local_apps_connected": len(bridge.local_apps),
        "cdp_connected": cdp_ready,
        "is_flow_ready": (len(bridge.flow_tabs) > 0) or cdp_ready
    }

@app.get("/files")
async def get_files():
    return {"status": "ok", "files": read_all_local_files()}

@app.get("/api/targets")
async def get_targets():
    return await cdp_engine.send("Target.getTargets")

@app.post("/api/eval")
async def api_eval(payload: Dict[str, Any]):
    expr = payload.get("expression")
    target_id = payload.get("targetId")
    if not target_id:
        targets_res = await cdp_engine.send("Target.getTargets")
        targets = targets_res.get("result", {}).get("targetInfos", [])
        flow_target = next((t for t in targets if 'flow.google.com' in t.get('url', '')), None)
        if flow_target:
            target_id = flow_target["targetId"]
    if not target_id:
        raise HTTPException(status_code=400, detail="Target not found")
    attach = await cdp_engine.send("Target.attachToTarget", {"targetId": target_id, "flatten": True})
    sid = attach.get("result", {}).get("sessionId")
    res = await cdp_engine.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, session_id=sid)
    return res

@app.post("/pull")
async def pull_from_flow(payload: Dict[str, Any]):
    files = payload.get("files", {})
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    saved = []
    for rel_path, content in files.items():
        clean_path = rel_path.lstrip("/\\")
        target = SRC_DIR / clean_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        saved.append(clean_path)
        print(f"[Bridge] Pulled from Flow: {clean_path} ({len(content)} bytes)")

    return {"status": "ok", "saved_count": len(saved), "saved_files": saved}

@app.post("/save_file")
async def save_file(payload: Dict[str, Any]):
    path = payload.get("path")
    content = payload.get("content", "")
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    target = SRC_DIR / path.lstrip("/\\")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"[Bridge] Saved local file: {path}")
    return {"status": "ok", "path": path}

@app.post("/api/generate_image")
async def api_generate_image(payload: Dict[str, Any]):
    """
    HTTP endpoint to trigger image generation through Google Flow.
    Uses Direct CDP Engine (Priority 1) with fallback to WebSocket Tab (Priority 2).
    """
    prompt = payload.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    aspect_ratio = payload.get("aspectRatio", "1:1")
    model = payload.get("modelDisplayName", "Nano Banana 2")
    reference_base64 = payload.get("referenceBase64")
    reference_mime_type = payload.get("referenceMimeType", "image/png")
    reference_base64_list = payload.get("referenceBase64List") or payload.get("referenceImageMediaIds") or []

    print(f"[Bridge] 📥 Received HTTP generate request: '{prompt[:50]}...' (has_ref: {bool(reference_base64)}, refs_count: {len(reference_base64_list)})")

    # Priority 1: High-Speed Direct CDP Engine
    try:
        cdp_res = await cdp_engine.generate_image(
            prompt,
            aspect_ratio=aspect_ratio,
            model=model,
            reference_base64=reference_base64,
            reference_mime_type=reference_mime_type,
            reference_base64_list=reference_base64_list
        )
        if cdp_res and cdp_res.get("base64"):
            print(f"[Bridge] 🎉 Direct CDP generation succeeded! (mediaId: {cdp_res.get('mediaId')})")
            # Save latest output.png
            try:
                import base64
                img_data = base64.b64decode(cdp_res["base64"])
                (BASE_DIR / "output.png").write_bytes(img_data)
            except Exception as e:
                print(f"[Bridge] Failed saving output.png: {e}")
            return cdp_res
    except Exception as cdp_err:
        print(f"[Bridge] CDP engine attempt: {cdp_err}. Falling back to WebSocket tab...")

    # Priority 2: Fallback to WebSocket Tab
    res = await bridge.dispatch_generation_request(payload)
    return res

@app.post("/api/analyze_style")
async def api_analyze_style(payload: Dict[str, Any]):
    """
    HTTP endpoint to analyze an image's artistic style using Google Flow Vision AI.
    """
    image_base64 = payload.get("base64")
    if not image_base64:
        raise HTTPException(status_code=400, detail="Base64 image is required")

    mime_type = payload.get("mimeType", "image/png")
    print(f"[Bridge] 🎨 Received style analysis request ({len(image_base64)} chars base64)")

    try:
        style_res = await cdp_engine.analyze_style(image_base64, mime_type=mime_type)
        return style_res
    except Exception as e:
        print(f"[Bridge] Style analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate_video")
async def api_generate_video(payload: Dict[str, Any]):
    """
    HTTP endpoint to trigger video generation (T2V, I2V, Morphing) through Google Flow.
    Default model: Omni 1.1 Flash. Supports Veo 3.1, Veo 2.
    """
    prompt = payload.get("prompt", "")
    model = payload.get("modelDisplayName", "Omni 1.1 Flash")
    first_frame = payload.get("firstFrameImageMediaId") or payload.get("firstFrameBase64") or payload.get("firstFrame")
    first_mime = payload.get("firstFrameMimeType", "image/png")
    last_frame = payload.get("lastFrameImageMediaId") or payload.get("lastFrameBase64") or payload.get("lastFrame")
    last_mime = payload.get("lastFrameMimeType", "image/png")
    reference_base64_list = payload.get("referenceBase64List") or payload.get("referenceImageMediaIds") or []
    aspect_ratio = payload.get("aspectRatio", "16:9")
    duration = int(payload.get("durationSeconds", 5))
    resolution = payload.get("resolution", "720p")

    print(f"[Bridge] 🎬 Received video generation request: '{prompt[:50]}...' (model: {model}, ratio: {aspect_ratio}, duration: {duration}s, refs_count: {len(reference_base64_list)})")

    try:
        video_res = await cdp_engine.generate_video(
            prompt=prompt,
            model=model,
            first_frame_base64=first_frame,
            first_frame_mime_type=first_mime,
            last_frame_base64=last_frame,
            last_frame_mime_type=last_mime,
            reference_base64_list=reference_base64_list,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration,
            resolution=resolution
        )
        if video_res and video_res.get("base64"):
            return video_res
        if video_res and not video_res.get("success"):
            raise HTTPException(status_code=500, detail=video_res.get("error", "Flow generation failed"))
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Flow video generation failed" in err_msg or "Expected object response" in err_msg:
            raise HTTPException(status_code=500, detail=err_msg)
        print(f"[Bridge] CDP video generation attempt failed: {e}. Trying WebSocket fallback...")

    # Fallback to WebSocket Tab
    try:
        payload["event"] = "generate_video_req"
        res = await bridge.dispatch_generation_request(payload, timeout_seconds=240.0)
        if res.get("status") == "error":
            raise HTTPException(status_code=500, detail=res.get("error", "Generation error from Flow tab"))
        return res
    except HTTPException:
        raise
    except Exception as fallback_err:
        print(f"[Bridge] Video generation failed: {fallback_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось сгенерировать видео через Google Flow: {fallback_err}"
        )

@app.get("/api/probe_flow")
@app.post("/api/probe_flow")
async def api_probe_flow():
    """Diagnostic probe to check available iframes and flow-sdk capabilities in Flow tab."""
    if not bridge.flow_tabs:
        raise HTTPException(status_code=503, detail="Вкладка Google Flow не подключена к мосту.")
    payload = {"event": "probe_flow_req", "id": f"probe-{uuid.uuid4().hex[:6]}"}
    res = await bridge.dispatch_generation_request(payload, timeout_seconds=15.0)
    return res

@app.post("/api/eval_debug")
async def api_eval_debug(payload: Dict[str, Any]):
    expr = payload.get("expression")
    if not expr:
        raise HTTPException(status_code=400, detail="expression required")
    sid = await cdp_engine.ensure_app_session()
    res = await cdp_engine.send("Runtime.evaluate", {
        "expression": expr,
        "awaitPromise": True,
        "returnByValue": True
    }, session_id=sid)
    return res

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, role: str = Query("local_app")):
    await bridge.connect(websocket, role)
    try:
        await websocket.send_json({
            "event": "connected",
            "message": f"Connected to Flow Bridge as {role}",
            "is_flow_ready": len(bridge.flow_tabs) > 0,
            "flow_tabs_count": len(bridge.flow_tabs)
        })

        while True:
            data = await websocket.receive_json()
            event = data.get("event")

            if event == "ping":
                await websocket.send_json({"event": "pong"})

            elif event == "identify":
                new_role = data.get("role", role)
                if new_role == "flow_tab" and websocket not in bridge.flow_tabs:
                    if websocket in bridge.local_apps:
                        bridge.local_apps.remove(websocket)
                    bridge.flow_tabs.append(websocket)
                    print(f"[Bridge] Client re-identified as 🌐 Flow Tab")
                    await bridge.broadcast_presence()

            elif event in ("generate_image_req", "generate_video_req", "probe_flow_req"):
                # Forward request from local app to flow tab
                print(f"[Bridge] 🔄 WS {event} -> routing to Flow tab")
                await bridge.send_to_flow(data)

            elif event in ("generate_image_res", "generate_video_res", "probe_flow_res"):
                # Resolve pending future and forward result to all local apps
                print(f"[Bridge] 🎯 WS {event} received for ID '{data.get('id')}' from Flow tab")
                bridge.resolve_generation_response(data)
                # Also broadcast to local apps
                for app_conn in bridge.local_apps:
                    try:
                        await app_conn.send_json(data)
                    except Exception:
                        pass

            elif event == "log":
                print(f"[Flow Web Log] [{data.get('level', 'info').upper()}] {data.get('message')}")

    except WebSocketDisconnect:
        bridge.disconnect(websocket)
        await bridge.broadcast_presence()
    except Exception as e:
        print(f"[Bridge] WS Exception: {e}")
        bridge.disconnect(websocket)
        await bridge.broadcast_presence()

if __name__ == "__main__":
    print("=" * 65)
    print("  Google Flow Sync & Generation Bridge Server v2.0")
    print(f"  Local Source: {SRC_DIR}")
    print("  URL: http://127.0.0.1:3210")
    print("=" * 65)
    uvicorn.run(app, host="127.0.0.1", port=3210, reload=False)
