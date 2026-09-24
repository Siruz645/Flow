import urllib.request
import urllib.parse
import json
import time

queries = [
    'flow-sdk',
    'flow.google.com tool',
    'flow-applet-compiler',
    'flow-applet-runner',
    'Flow.media.select',
    'Flow.generate.image',
    'crisng95/flowkit'
]

print("=== GITHUB CODE & REPO SEARCH ===")
for q in queries:
    url = f"https://api.github.com/search/code?q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode())
        count = data.get('total_count', 0)
        print(f"\n[Code Query: '{q}'] -> Total: {count}")
        for item in data.get('items', [])[:3]:
            repo = item.get('repository', {}).get('full_name', '')
            path = item.get('path', '')
            html_url = item.get('html_url', '')
            print(f"  * Repo: {repo} | File: {path}\n    URL: {html_url}")
    except Exception as e:
        print(f"[Code Query: '{q}'] Error: {e}")
    time.sleep(1)

# Also search repositories
repo_queries = [
    'google flow tool',
    'google flow applet',
    'flow.google'
]
for q in repo_queries:
    url = f"https://api.github.com/search/repositories?q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode())
        count = data.get('total_count', 0)
        print(f"\n[Repo Query: '{q}'] -> Total: {count}")
        for item in data.get('items', [])[:3]:
            name = item.get('full_name', '')
            desc = item.get('description', '')
            url = item.get('html_url', '')
            print(f"  * {name}: {desc}\n    URL: {url}")
    except Exception as e:
        print(f"[Repo Query: '{q}'] Error: {e}")
    time.sleep(1)
