import urllib.request
import json

for ep in ["/json", "/json/version", "/json/protocol"]:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:9222{ep}") as resp:
            print(f"{ep}: {resp.status} - {resp.read()[:200]}")
    except Exception as e:
        print(f"{ep}: {e}")
