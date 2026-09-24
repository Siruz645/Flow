import asyncio
import json
from cdp_explore import CDPClient, DEVTOOLS_WS

async def print_script_1():
    client = CDPClient(DEVTOOLS_WS)
    await client.connect()
    res = await client.send("Target.getTargets")
    targets = res.get("result", {}).get("targetInfos", [])
    flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "29q1mdz8j9ll3phnvsdsms63nsrp66hrp3o4u1clutl2pcor7v" in t.get("url", "")), None)
    attach_res = await client.send("Target.attachToTarget", {"targetId": flow_app_target["targetId"], "flatten": True})
    sid = attach_res.get("result", {}).get("sessionId")
    
    scripts_res = await client.send("Runtime.evaluate", {
        "expression": "document.querySelectorAll('script')[1].innerHTML",
        "returnByValue": True
    }, session_id=sid)
    print("SCRIPT 1:")
    print(scripts_res.get("result", {}).get("result", {}).get("value"))
    
    # Also inspect importmap (SCRIPT 3)
    importmap_res = await client.send("Runtime.evaluate", {
        "expression": "document.querySelectorAll('script')[3].innerHTML",
        "returnByValue": True
    }, session_id=sid)
    print("\nIMPORTMAP:")
    print(importmap_res.get("result", {}).get("result", {}).get("value"))

    await client.close()

if __name__ == "__main__":
    asyncio.run(print_script_1())
