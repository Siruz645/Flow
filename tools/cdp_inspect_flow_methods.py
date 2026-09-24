import asyncio
import json
from generate_flow_image import CDPFlowGenerator

async def inspect_flow():
    gen = CDPFlowGenerator()
    await gen.connect()
    
    # Get targets
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
            const info = {};
            for (const key of Object.keys(Flow)) {
                if (typeof Flow[key] === 'object' && Flow[key] !== null) {
                    info[key] = Object.keys(Flow[key]);
                } else if (typeof Flow[key] === 'function') {
                    info[key] = Flow[key].toString().slice(0, 150);
                }
            }
            return info;
        })()
    """
    res = await gen.send("Runtime.evaluate", {"expression": code, "awaitPromise": True, "returnByValue": True}, session_id=runner_sid)
    print("Flow Methods Info:")
    print(json.dumps(res.get("result", {}).get("result", {}).get("value"), indent=2))
    
    await gen.close()

if __name__ == "__main__":
    asyncio.run(inspect_flow())
