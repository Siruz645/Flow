import asyncio
import json
from generate_flow_image import CDPFlowGenerator

async def dump_details():
    gen = CDPFlowGenerator()
    await gen.connect()
    
    targets_res = await gen.send("Target.getTargets")
    targets = targets_res.get("result", {}).get("targetInfos", [])
    
    runner_sid = None
    for t in targets:
        if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", ""):
            tid = t["targetId"]
            attach = await gen.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
            sid = attach.get("result", {}).get("sessionId")
            if sid:
                chk = await gen.send("Runtime.evaluate", {"expression": "document.title", "returnByValue": True}, session_id=sid)
                if chk.get("result", {}).get("result", {}).get("value") == "Flow app":
                    runner_sid = sid
                    break

    if not runner_sid:
        print("Runner iframe not found")
        await gen.close()
        return

    code = """
        (async () => {
            const { Flow } = await import('flow-sdk');
            return {
                text_fn: Flow.generate.text.toString(),
                video_fn: Flow.generate.video.toString(),
                image_fn: Flow.generate.image.toString(),
                mic_fn: Flow.microphone.record.toString(),
                camera_fn: Flow.camera.capture.toString()
            };
        })()
    """
    res = await gen.send("Runtime.evaluate", {"expression": code, "awaitPromise": True, "returnByValue": True}, session_id=runner_sid)
    data = res.get("result", {}).get("result", {}).get("value", {})
    
    for k, v in data.items():
        print(f"\n=================== {k} ===================")
        print(v)
        
    await gen.close()

if __name__ == "__main__":
    asyncio.run(dump_details())
