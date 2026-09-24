import asyncio
import json
import websockets
from cdp_explore import CDPClient, DEVTOOLS_WS

async def inspect_flow_app():
    client = CDPClient(DEVTOOLS_WS)
    await client.connect()
    
    res = await client.send("Target.getTargets")
    targets = res.get("result", {}).get("targetInfos", [])
    
    flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "29q1mdz8j9ll3phnvsdsms63nsrp66hrp3o4u1clutl2pcor7v" in t.get("url", "")), None)
    if not flow_app_target:
        # Fallback to any iframe
        flow_app_target = next((t for t in targets if t.get("type") == "iframe" and "scf.usercontent.goog" in t.get("url", "") and "Compiler" not in t.get("title", "")), None)
        
    print("Found Flow app target:", flow_app_target)
    attach_res = await client.send("Target.attachToTarget", {"targetId": flow_app_target["targetId"], "flatten": True})
    sid = attach_res.get("result", {}).get("sessionId")
    
    # 1. Print HTML snippet
    html_res = await client.send("Runtime.evaluate", {
        "expression": "document.body.innerHTML.slice(0, 2000)",
        "returnByValue": True
    }, session_id=sid)
    print("\n--- HTML snippet ---")
    print(html_res.get("result", {}).get("result", {}).get("value"))
    
    # 2. Inspect window globals
    globals_res = await client.send("Runtime.evaluate", {
        "expression": """
            Object.getOwnPropertyNames(window).filter(k => 
                !k.startsWith('webkit') && 
                !['window', 'self', 'document', 'name', 'location', 'customElements', 'history', 'navigation', 'locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar', 'status', 'closed', 'frames', 'length', 'top', 'opener', 'parent', 'frameElement', 'navigator', 'origin', 'external', 'screen', 'innerWidth', 'innerHeight', 'scrollX', 'pageXOffset', 'scrollY', 'pageYOffset', 'visualViewport', 'screenX', 'screenY', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'clientInformation', 'screenLeft', 'screenTop', 'styleMedia', 'onsearch', 'isSecureContext', 'trustedTypes', 'performance', 'onappinstalled', 'onbeforeinstallprompt'].includes(k)
            )
        """,
        "returnByValue": True
    }, session_id=sid)
    print("\n--- Window custom properties ---")
    print(globals_res.get("result", {}).get("result", {}).get("value"))

    # 3. Check for any flow-sdk or imported modules
    sdk_res = await client.send("Runtime.evaluate", {
        "expression": """
            ({
                buttons: Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText, id: b.id, className: b.className })),
                inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ placeholder: i.placeholder, value: i.value })),
                scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerText.slice(0, 100))
            })
        """,
        "returnByValue": True
    }, session_id=sid)
    print("\n--- UI Elements & Scripts ---")
    print(json.dumps(sdk_res.get("result", {}).get("result", {}).get("value"), indent=2))

    await client.close()

if __name__ == "__main__":
    asyncio.run(inspect_flow_app())
