"""
Standalone CLI & Library for Google Flow Image Generation.
Directly communicates with the active Google Flow tool session in Opera GX / Chrome.
"""
import sys
import os

# Force UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import asyncio
import json
import base64
import argparse
import time
from pathlib import Path
import websockets

def discover_devtools_ws():
    port_file = Path.home() / "AppData" / "Roaming" / "Opera Software" / "Opera GX Stable" / "DevToolsActivePort"
    if port_file.exists():
        lines = port_file.read_text(encoding="utf-8").strip().splitlines()
        if len(lines) >= 2:
            return f"ws://127.0.0.1:{lines[0].strip()}{lines[1].strip()}"
    return "ws://127.0.0.1:9222/devtools/browser"

class CDPFlowGenerator:
    def __init__(self, ws_url=None):
        self.ws_url = ws_url or discover_devtools_ws()
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.listen_task = None

    async def connect(self, timeout=60):
        self.ws = await websockets.connect(self.ws_url, max_size=150_000_000, open_timeout=timeout)
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
        except Exception:
            pass

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

    async def generate(self, prompt: str, aspect_ratio: str = "1:1", model: str = "🍌 Nano Banana Pro", output_path: str = "output.png"):
        print(f"[{time.strftime('%H:%M:%S')}] Connecting to Browser DevTools ({self.ws_url})...")
        await self.connect()

        # Find Flow app runner iframe
        targets_res = await self.send("Target.getTargets")
        targets = targets_res.get("result", {}).get("targetInfos", [])

        runner_sid = None
        for t in targets:
            url = t.get("url", "")
            if t.get("type") == "iframe" and "scf.usercontent.goog" in url:
                tid = t["targetId"]
                attach = await self.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
                sid = attach.get("result", {}).get("sessionId")
                if sid:
                    chk = await self.send("Runtime.evaluate", {"expression": "document.title", "returnByValue": True}, session_id=sid)
                    title = chk.get("result", {}).get("result", {}).get("value", "")
                    if title == "Flow app":
                        runner_sid = sid
                        print(f"[{time.strftime('%H:%M:%S')}] Found Flow App Target: {tid}")
                        break

        if not runner_sid:
            await self.close()
            raise RuntimeError("Не найден активный фрейм Flow app в браузере. Убедитесь, что открыт инструмент во Flow.")

        print(f"[{time.strftime('%H:%M:%S')}] 🎨 Отправка запроса в Nano Banana Pro: '{prompt[:45]}...'")
        js_code = f"""
            (async () => {{
                try {{
                    const {{ Flow }} = await import('flow-sdk');
                    const res = await Flow.generate.image({{
                        prompt: {json.dumps(prompt)},
                        aspectRatio: {json.dumps(aspect_ratio)},
                        modelDisplayName: {json.dumps(model)}
                    }});
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

        t0 = time.time()
        eval_res = await self.send("Runtime.evaluate", {
            "expression": js_code,
            "awaitPromise": True,
            "returnByValue": True,
            "timeout": 120000
        }, session_id=runner_sid)
        elapsed = round(time.time() - t0, 1)

        val = eval_res.get("result", {}).get("result", {}).get("value", {})
        await self.close()

        if not val.get("success"):
            err = val.get("error", "Unknown error")
            raise RuntimeError(f"Flow generation error: {err}")

        b64 = val.get("base64")
        media_id = val.get("mediaId")
        mime = val.get("mimeType", "image/jpeg")

        if not b64:
            raise RuntimeError("Пустой base64 ответ от Flow")

        img_bytes = base64.b64decode(b64)
        out_file = Path(output_path).resolve()
        out_file.write_bytes(img_bytes)

        print(f"[{time.strftime('%H:%M:%S')}] ✅ Успешно за {elapsed}с! Сохранено: {out_file} ({len(img_bytes)} байт, mediaId: {media_id})")
        return {
            "status": "success",
            "file": str(out_file),
            "size": len(img_bytes),
            "mediaId": media_id,
            "mimeType": mime,
            "base64": b64
        }

MODEL_MAP = {
    "pro": "🍌 Nano Banana Pro",
    "banana_pro": "🍌 Nano Banana Pro",
    "gem_pix_2": "🍌 Nano Banana Pro",
    "banana2": "Nano Banana 2",
    "narwhal": "Nano Banana 2",
    "lite": "Nano Banana 2 Lite",
    "harbor_seal": "Nano Banana 2 Lite",
    "veo": "Google Veo AI",
    "veo2": "Google Veo AI",
}

def try_bridge_http(prompt: str, aspect_ratio: str = "1:1", model: str = "🍌 Nano Banana Pro", output_path: str = "output.png") -> bool:
    import urllib.request
    import urllib.error
    url = "http://127.0.0.1:3210/api/generate_image"
    payload = {
        "prompt": prompt,
        "aspectRatio": aspect_ratio,
        "modelDisplayName": model
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        print(f"[{time.strftime('%H:%M:%S')}] 🌐 Отправка запроса через локальный Bridge Server (http://127.0.0.1:3210)...")
        with urllib.request.urlopen(req, timeout=180) as resp:
            if resp.status == 200:
                res_json = json.loads(resp.read().decode("utf-8"))
                b64 = res_json.get("base64")
                media_id = res_json.get("mediaId")
                if b64:
                    img_bytes = base64.b64decode(b64)
                    out_file = Path(output_path).resolve()
                    out_file.write_bytes(img_bytes)
                    print(f"[{time.strftime('%H:%M:%S')}] ✅ Успешно! Сохранено: {out_file} ({len(img_bytes)} байт, mediaId: {media_id})")
                    return True
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] Bridge Server HTTP недоступен ({e}), переход на прямой CDP...")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Google Flow Image Generator CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Модели (--model):
  pro, banana_pro      -> 🍌 Nano Banana Pro (Флагман Imagen 3, 1K/2K/4K)
  banana2, narwhal     -> Nano Banana 2 (Быстрая генерация)
  lite, harbor_seal    -> Nano Banana 2 Lite (Экономный драфт)
  veo, veo2            -> Google Veo AI (Кинематографичный рендер)

Примеры:
  python tools/generate_flow_image.py "Cyberpunk cat" --model pro --aspect 16:9
  python tools/generate_flow_image.py "Futuristic car" --model banana2 --aspect 1:1 --out car.png
"""
    )
    parser.add_argument("prompt", help="Текстовое описание изображения (промпт)")
    parser.add_argument("--aspect", default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"], help="Соотношение сторон (по умолчанию: 1:1)")
    parser.add_argument("--model", default="pro", help="Модель: pro, banana2, lite, veo или точное имя Flow (по умолчанию: pro)")
    parser.add_argument("--out", default="output.png", help="Путь для сохранения (по умолчанию: output.png)")
    args = parser.parse_args()

    resolved_model = MODEL_MAP.get(args.model.lower().strip(), args.model)

    # 1. First attempt via Bridge HTTP Server
    if try_bridge_http(
        prompt=args.prompt,
        aspect_ratio=args.aspect,
        model=resolved_model,
        output_path=args.out
    ):
        return

    # 2. Fallback to direct CDP
    gen = CDPFlowGenerator()
    try:
        asyncio.run(gen.generate(args.prompt, aspect_ratio=args.aspect, model=resolved_model, output_path=args.out))
    except Exception as e:
        print(f"Ошибка: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
