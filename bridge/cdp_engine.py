import asyncio
import json
import websockets
from pathlib import Path
import time
import sys
import hashlib
from typing import Dict, List, Optional, Tuple

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
        self.cache_file = Path(__file__).resolve().parent / "media_cache.json"
        self.media_cache: Dict[str, str] = self._load_cache()

    def _load_cache(self) -> dict:
        if self.cache_file.exists():
            try:
                return json.loads(self.cache_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    def _save_cache(self):
        try:
            self.cache_file.write_text(json.dumps(self.media_cache, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[CDPEngine] Failed saving media cache: {e}")

    def _is_media_id(self, val: str) -> bool:
        if not val or not isinstance(val, str):
            return False
        val = val.strip()
        # Media IDs are typically UUIDs (36 chars) or alphanumeric tokens without long base64 chars
        if len(val) < 80 and "/" not in val and "+" not in val and "=" not in val and not val.startswith("data:"):
            return True
        return False

    def _get_b64_hash(self, b64_str: str) -> str:
        if not b64_str or not isinstance(b64_str, str):
            return ""
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        return hashlib.sha256(b64_str.strip().encode("utf-8")).hexdigest()

    def resolve_media_item(self, item: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Returns (media_id, base64_to_upload, hash_key)
        - If already a mediaId: (item, None, None)
        - If cached in media_cache: (cached_id, None, hash_key)
        - If new base64: (None, clean_b64, hash_key)
        """
        if not item or not isinstance(item, str):
            return (None, None, None)
        item = item.strip()
        if self._is_media_id(item):
            return (item, None, None)

        clean_b64 = item.split(",", 1)[1] if "," in item else item
        h = hashlib.sha256(clean_b64.strip().encode("utf-8")).hexdigest()
        if h in self.media_cache:
            return (self.media_cache[h], None, h)
        return (None, clean_b64, h)

    def _discover_ws_url(self) -> str:
        candidates = [
            Path.home() / "AppData" / "Roaming" / "Opera Software" / "Opera GX Stable" / "DevToolsActivePort",
            Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data" / "DevToolsActivePort",
            Path.home() / "AppData" / "Local" / "Microsoft" / "Edge" / "User Data" / "DevToolsActivePort",
            Path.home() / "AppData" / "Roaming" / "Opera Software" / "Opera Stable" / "DevToolsActivePort",
        ]
        for f in candidates:
            if f.exists():
                try:
                    lines = f.read_text(encoding="utf-8").strip().splitlines()
                    if len(lines) >= 2:
                        port = lines[0].strip()
                        path = lines[1].strip()
                        return f"ws://127.0.0.1:{port}{path}"
                except Exception:
                    pass
        return "ws://127.0.0.1:9222/devtools/browser"

    async def connect(self, timeout=10, retries=5):
        if self.ws and not self.ws.closed:
            return True
            
        for attempt in range(1, retries + 1):
            self.ws_url = self._discover_ws_url()
            print(f"[CDPEngine] Connecting to DevTools (attempt {attempt}/{retries}): {self.ws_url}")
            try:
                self.ws = await websockets.connect(
                    self.ws_url,
                    max_size=150_000_000,
                    open_timeout=timeout,
                    origin=None
                )
                self.listen_task = asyncio.create_task(self._listen())
                print("[CDPEngine] DevTools connection established successfully!")
                await self.send("Target.setDiscoverTargets", {"discover": True})
                return True
            except Exception as e:
                print(f"[CDPEngine] Connection attempt {attempt} failed: {e}")
                if attempt < retries:
                    await asyncio.sleep(1.5)
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

        # If runner iframe not directly found, check if we need to enter applet from Flow page
        flow_target = next((t for t in targets if 'flow.google.com' in t.get('url', '')), None)
        if flow_target:
            attach_flow = await self.send("Target.attachToTarget", {"targetId": flow_target["targetId"], "flatten": True})
            flow_sid = attach_flow.get("result", {}).get("sessionId")
            if flow_sid:
                await self.send("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True}, session_id=flow_sid)
                print("[CDPEngine] Attempting to auto-activate applet runner from Flow page...")
                await self.send("Runtime.evaluate", {
                    "expression": """(() => {
                        let cards = Array.from(document.querySelectorAll('.applet-card'));
                        if (cards.length === 0) {
                            const toolsBtn = Array.from(document.querySelectorAll('a, button, mat-icon'))
                                .find(el => (el.innerText || '').includes('apps_spark_2'));
                            if (toolsBtn) {
                                const target = toolsBtn.closest('a') || toolsBtn.closest('button') || toolsBtn;
                                target.click();
                            }
                        }
                    })()"""
                }, session_id=flow_sid)
                await asyncio.sleep(2)

                await self.send("Runtime.evaluate", {
                    "expression": """(() => {
                        const cards = Array.from(document.querySelectorAll('.applet-card'));
                        const targetCard = cards.find(c => c.innerText.includes('AI Редактор Областей')) || cards[0];
                        if (targetCard) targetCard.click();
                    })()"""
                }, session_id=flow_sid)
                await asyncio.sleep(4)
                
                # Check targets again
                new_targets_res = await self.send("Target.getTargets")
                for t in new_targets_res.get("result", {}).get("targetInfos", []):
                    if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", ""):
                        tid = t["targetId"]
                        attach = await self.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
                        sid = attach.get("result", {}).get("sessionId")
                        if sid:
                            try:
                                chk = await self.send("Runtime.evaluate", {"expression": "document.title", "returnByValue": True}, session_id=sid)
                                if chk.get("result", {}).get("result", {}).get("value") == "Flow app":
                                    self.target_id = tid
                                    self.session_id = sid
                                    return self.session_id
                            except Exception:
                                pass

        print("[CDPEngine] ⚠️ No Google Flow applet iframe found in browser!")
        return None

    async def generate_image(self, prompt: str, aspect_ratio: str = "1:1", model: str = "Nano Banana 2", reference_base64: str = None, reference_mime_type: str = None, reference_base64_list: list = None, timeout_sec: int = 120):
        sid = await self.ensure_app_session()
        if not sid:
            raise RuntimeError("Google Flow tab or applet iframe is not active in browser")

        # Resolve existing / cached MediaIDs vs new uploads
        existing_ref_ids = []
        new_uploads = []

        all_refs = []
        if reference_base64:
            all_refs.append((reference_base64, reference_mime_type or "image/png", "ref_edit.png"))
        if reference_base64_list:
            for i, r in enumerate(reference_base64_list):
                if r:
                    all_refs.append((r, "image/png", f"ref_img_{i + 1}.png"))

        for r_item, r_mime, r_name in all_refs:
            m_id, b64_up, h = self.resolve_media_item(r_item)
            if m_id:
                if m_id not in existing_ref_ids:
                    print(f"[CDPEngine] ⚡ Reusing existing MediaID for image reference: {m_id}")
                    existing_ref_ids.append(m_id)
            elif b64_up:
                new_uploads.append({"b64": b64_up, "mime": r_mime, "hash": h, "name": r_name})

        js_code = f"""
            (async () => {{
                try {{
                    const {{ Flow }} = await import('flow-sdk');
                    let refIds = {json.dumps(existing_ref_ids)};
                    const uploads = {json.dumps(new_uploads)};
                    let uploadedMappings = [];

                    for (let i = 0; i < uploads.length; i++) {{
                        const upItem = uploads[i];
                        console.log(`[CDP Image] Uploading new reference image ${{i + 1}}...`);
                        const upRef = await Flow.upload({{
                            base64: upItem.b64,
                            mimeType: upItem.mime || 'image/png',
                            name: upItem.name || `ref_${{i + 1}}.png`
                        }});
                        if (upRef?.mediaId) {{
                            refIds.push(upRef.mediaId);
                            uploadedMappings.push({{ hash: upItem.hash, mediaId: upRef.mediaId }});
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
                        base64: res.base64,
                        uploadedMappings
                    }};
                }} catch (err) {{
                    return {{
                        success: false,
                        error: err.message || String(err)
                    }};
                }}
            }})()
        """
        
        print(f"[CDPEngine] 🎨 Executing Flow.generate.image: '{prompt[:40]}...' (model: {model}, ratio: {aspect_ratio}, existing_refs: {len(existing_ref_ids)}, new_uploads: {len(new_uploads)})")
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

        # Update cache with newly uploaded items
        for mapping in val.get("uploadedMappings", []):
            if mapping.get("hash") and mapping.get("mediaId"):
                self.media_cache[mapping["hash"]] = mapping["mediaId"]

        # Cache generated image result
        res_media_id = val.get("mediaId")
        res_b64 = val.get("base64")
        if res_media_id and res_b64:
            self.media_cache[self._get_b64_hash(res_b64)] = res_media_id
            self._save_cache()

        return {
            "status": "success",
            "mediaId": val.get("mediaId"),
            "mimeType": val.get("mimeType", "image/jpeg"),
            "base64": val.get("base64")
        }

    async def analyze_style(self, image_base64: str, mime_type: str = "image/png", timeout_sec: int = 60) -> dict:
        sid = await self.ensure_app_session()
        if not sid:
            raise RuntimeError("Google Flow tab or applet iframe is not active in browser")

        prompt = (
            "Ты — ведущий арт-директор и эксперт по художественной стилизации в нейросетях.\n"
            "Твоя задача — извлечь ТОЛЬКО ХУДОЖЕСТВЕННЫЙ СТИЛЬ, МАНЕРУ РИСОВКИ И ГРАФИЧЕСКИЙ ПАЙПЛАЙН из изображения.\n\n"
            "КАТЕГОРИЧЕСКИЙ ЗАПРЕТ (НЕ ПИСАТЬ):\n"
            "- Запрещено описывать одежду (майки, ткани, швы, складки одежды).\n"
            "- Запрещено описывать позу, ракурс тела, мускулы, анатомию, лицо, пол, человека или персонажа.\n"
            "- Запрещено описывать сюжет и конкретные объекты в кадре.\n\n"
            "ОПИШИ ИСКЛЮЧИТЕЛЬНО ХУДОЖЕСТВЕННУЮ МАНЕРУ:\n"
            "1. Стиль и манера рисовки (например: стилизованный 3D-диджитал арт, полуреалистичный концепт-арт, гладкий шейдинг, плакатная графика, академическая живопись).\n"
            "2. Техника отрисовки и рендера (работа с градиентами, микротекстуры, гладкость поверхностей, четкость контуров, блики).\n"
            "3. Постановка света и контраст (жесткий контровой свет / rim lighting, мягкая теневая градация, глубина ambient occlusion).\n"
            "4. Цветовая палитра и колористика (ключевые HEX-цвета и баланс насыщенности/температуры).\n\n"
            "Выведи СТРОГИЙ JSON объект (без markdown codeblocks):\n"
            "{\n"
            '  "style_name": "Название художественного стиля (на русском)",\n'
            '  "art_style_manner": "Детальное описание манеры рисовки и визуальной эстетики (без упоминания персонажей и одежды)",\n'
            '  "rendering_technique": "Техника рендера, шейдинг поверхностей, блики и текстурная проработка",\n'
            '  "lighting_schema": "Световая схема, контровой свет, контрастность и цветовая температура",\n'
            '  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],\n'
            '  "flow_prompt_directive": "Промпт-директива на английском для модели генерации, как отрисовать ЛЮБОЙ целевой объект в этой точной манере рисовки"\n'
            "}"
        )

        js_code = f"""
            (async () => {{
                try {{
                    const {{ Flow }} = await import('flow-sdk');
                    const imgData = {json.dumps(image_base64)};
                    const mime = {json.dumps(mime_type or "image/png")};

                    console.log('[CDP] Analyzing artistic manner via Flow.generate.text...');
                    const res = await Flow.generate.text({{
                        prompt: {json.dumps(prompt)},
                        images: [
                            {{
                                base64: imgData,
                                mimeType: mime
                            }}
                        ]
                    }});

                    return {{
                        success: true,
                        text: res?.text || ''
                    }};
                }} catch (err) {{
                    return {{
                        success: false,
                        error: err.message || String(err)
                    }};
                }}
            }})()
        """

        print(f"[CDPEngine] 🧠 Executing Flow AI Vision style extraction ({len(image_base64)} b64 chars)...")
        res = await self.send("Runtime.evaluate", {
            "expression": js_code,
            "awaitPromise": True,
            "returnByValue": True,
            "timeout": timeout_sec * 1000
        }, session_id=sid)

        val = res.get("result", {}).get("result", {}).get("value", {})
        if not val.get("success"):
            err_msg = val.get("error", "Unknown error in Flow vision runner")
            raise RuntimeError(f"Flow style analysis failed: {err_msg}")

        raw_text = val.get("text", "").strip()
        # Clean any markdown codeblocks if model wrapped it
        clean_text = raw_text
        if clean_text.startswith("```"):
            lines = clean_text.splitlines()
            if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
                clean_text = "\n".join(lines[1:-1]).strip()

        try:
            parsed_json = json.loads(clean_text)
            return {
                "status": "success",
                "style": parsed_json,
                "raw_text": raw_text
            }
        except Exception as e:
            print(f"[CDPEngine] Failed to parse JSON from AI response: {raw_text}, fallback text")
            return {
                "status": "success",
                "style": {
                    "style_name": "AI Reference Style",
                    "medium": "AI Extracted Style",
                    "details": raw_text
                },
                "raw_text": raw_text
            }

    async def generate_video(
        self,
        prompt: str,
        model: str = "Omni 1.1 Flash",
        first_frame_base64: str = None,
        first_frame_mime_type: str = "image/png",
        last_frame_base64: str = None,
        last_frame_mime_type: str = "image/png",
        reference_base64_list: list = None,
        aspect_ratio: str = "16:9",
        duration_seconds: int = 5,
        resolution: str = "720p",
        timeout_sec: int = 240
    ) -> dict:
        sid = await self.ensure_app_session()
        if not sid:
            raise RuntimeError("Google Flow tab or applet iframe is not active in browser")

        # Resolve first frame
        first_media_id, first_upload_b64, first_hash = self.resolve_media_item(first_frame_base64)
        if first_media_id:
            print(f"[CDPEngine] ⚡ Reusing existing MediaID for first frame: {first_media_id}")

        # Resolve last frame (for morphing)
        last_media_id, last_upload_b64, last_hash = self.resolve_media_item(last_frame_base64)
        if last_media_id:
            print(f"[CDPEngine] ⚡ Reusing existing MediaID for last frame: {last_media_id}")

        # Resolve references
        existing_ref_ids = []
        new_ref_uploads = []
        for i, r in enumerate(reference_base64_list or []):
            if r:
                m_id, b64_up, h = self.resolve_media_item(r)
                if m_id:
                    if m_id not in existing_ref_ids:
                        print(f"[CDPEngine] ⚡ Reusing existing MediaID for video reference: {m_id}")
                        existing_ref_ids.append(m_id)
                elif b64_up:
                    new_ref_uploads.append({"b64": b64_up, "hash": h, "name": f"ref_vid_{i + 1}.png"})

        js_code = f"""
            (async () => {{
                try {{
                    const {{ Flow }} = await import('flow-sdk');
                    let firstFrameId = {json.dumps(first_media_id)};
                    let lastFrameId = {json.dumps(last_media_id)};
                    let refMediaIds = {json.dumps(existing_ref_ids)};
                    let uploadedMappings = [];

                    const firstB64 = {json.dumps(first_upload_b64)};
                    const firstMime = {json.dumps(first_frame_mime_type or "image/png")};
                    const lastB64 = {json.dumps(last_upload_b64)};
                    const lastMime = {json.dumps(last_frame_mime_type or "image/png")};
                    const refUploads = {json.dumps(new_ref_uploads)};

                    if (firstB64 && !firstFrameId) {{
                        console.log('[CDP Video] Uploading new first frame...');
                        const up1 = await Flow.upload({{
                            base64: firstB64,
                            mimeType: firstMime,
                            name: 'first_frame.png'
                        }});
                        firstFrameId = up1?.mediaId;
                        if (firstFrameId) uploadedMappings.push({{ hash: {json.dumps(first_hash)}, mediaId: firstFrameId }});
                    }}

                    if (lastB64 && !lastFrameId) {{
                        console.log('[CDP Video] Uploading new last frame for morphing...');
                        const up2 = await Flow.upload({{
                            base64: lastB64,
                            mimeType: lastMime,
                            name: 'last_frame.png'
                        }});
                        lastFrameId = up2?.mediaId;
                        if (lastFrameId) uploadedMappings.push({{ hash: {json.dumps(last_hash)}, mediaId: lastFrameId }});
                    }}

                    for (let i = 0; i < refUploads.length; i++) {{
                        const upItem = refUploads[i];
                        console.log(`[CDP Video] Uploading new reference frame ${{i + 1}}...`);
                        const upRef = await Flow.upload({{
                            base64: upItem.b64,
                            mimeType: 'image/png',
                            name: upItem.name || `ref_vid_${{i + 1}}.png`
                        }});
                        if (upRef?.mediaId) {{
                            refMediaIds.push(upRef.mediaId);
                            uploadedMappings.push({{ hash: upItem.hash, mediaId: upRef.mediaId }});
                        }}
                    }}

                    const videoOpts = {{
                        prompt: {json.dumps(prompt)},
                        aspectRatio: {json.dumps(aspect_ratio or "16:9")}
                    }};
                    if (!firstFrameId && !lastFrameId && refMediaIds.length === 0 && {json.dumps(duration_seconds)} != null) {{
                        videoOpts.durationSeconds = {int(duration_seconds)};
                    }}
                    if ({json.dumps(model)} && {json.dumps(model)} !== 'Omni 1.1 Flash') {{
                        videoOpts.modelDisplayName = {json.dumps(model)};
                    }}
                    if (firstFrameId) videoOpts.firstFrameImageMediaId = firstFrameId;
                    if (lastFrameId) videoOpts.lastFrameImageMediaId = lastFrameId;
                    if (refMediaIds.length > 0) videoOpts.referenceImageMediaIds = refMediaIds;

                    console.log('[CDP Video] Dispatching Flow.generate.video:', JSON.stringify(videoOpts));
                    const res = await Flow.generate.video(videoOpts);
                    console.log('[CDP Video] Received response:', res ? Object.keys(res) : null);
                    
                    if (!res) throw new Error('Empty response received from Flow.generate.video');

                    return {{
                        success: true,
                        mediaId: res.mediaId || res.id,
                        mimeType: res.mimeType || 'video/mp4',
                        base64: res.base64,
                        uploadedMappings
                    }};
                }} catch (err) {{
                    console.error('[CDP Video] Flow.generate.video caught error:', err);
                    return {{
                        success: false,
                        error: err?.message || String(err)
                    }};
                }}
            }})()
        """

        print(f"[CDPEngine] 🎬 Executing Flow.generate.video: '{prompt[:45]}...' (model: {model}, ratio: {aspect_ratio}, duration: {duration_seconds}s, has_first: {bool(first_frame_base64)}, has_last: {bool(last_frame_base64)}, existing_refs: {len(existing_ref_ids)}, new_uploads: {len(new_ref_uploads)})")
        res = await self.send("Runtime.evaluate", {
            "expression": js_code,
            "awaitPromise": True,
            "returnByValue": True,
            "timeout": timeout_sec * 1000
        }, session_id=sid)

        val = res.get("result", {}).get("result", {}).get("value", {})
        if not val.get("success"):
            err_msg = val.get("error", "Unknown error in Flow video generator")
            print(f"[CDPEngine] ❌ Flow video runner returned error: {err_msg}")
            raise RuntimeError(f"Flow video generation failed: {err_msg}")

        # Update cache with newly uploaded items
        for mapping in val.get("uploadedMappings", []):
            if mapping.get("hash") and mapping.get("mediaId"):
                self.media_cache[mapping["hash"]] = mapping["mediaId"]

        # Cache generated video result
        res_media_id = val.get("mediaId")
        res_b64 = val.get("base64")
        if res_media_id and res_b64:
            self.media_cache[self._get_b64_hash(res_b64)] = res_media_id
            self._save_cache()

        b64 = val.get("base64")
        if not b64:
            raise RuntimeError("Empty base64 video data received from Flow")

        # Save MP4 video binary
        try:
            import base64 as b64module
            video_bytes = b64module.b64decode(b64)
            root_dir = Path(__file__).resolve().parent.parent
            (root_dir / "output.mp4").write_bytes(video_bytes)
            (root_dir / "scratch" / "test_output.mp4").write_bytes(video_bytes)
            print(f"[CDPEngine] 🎬 Saved valid MP4 video ({len(video_bytes)} bytes, header: {video_bytes[:8]})")
        except Exception as save_err:
            print(f"[CDPEngine] Warning: could not write local mp4 files: {save_err}")

        return {
            "status": "success",
            "mediaId": val.get("mediaId"),
            "mimeType": val.get("mimeType", "video/mp4"),
            "base64": b64
        }

    async def close(self):
        if self.listen_task:
            self.listen_task.cancel()
        if self.ws:
            await self.ws.close()


