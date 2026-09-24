import urllib.request
import json

def main():
    try:
        with urllib.request.urlopen("http://127.0.0.1:9222/json/list") as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"Total endpoints in /json/list: {len(data)}")
            for item in data:
                url = item.get("url", "")
                if any(k in url for k in ["flow.google", "5173", "usercontent", "3210"]):
                    print("-----------------------------")
                    print(f"Type: {item.get('type')}")
                    print(f"Title: {item.get('title')}")
                    print(f"URL: {url}")
                    print(f"WS: {item.get('webSocketDebuggerUrl')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
