import sys
import time
import json
import urllib.request
from pathlib import Path

# Force UTF-8 on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:3210"

def test_bridge():
    print("[Test] Testing Bridge Server endpoints...")
    
    # 1. Status
    try:
        req = urllib.request.urlopen(f"{BASE_URL}/status", timeout=3)
        res = json.loads(req.read().decode())
        print(f"[Test] /status OK: {res}")
        assert res.get("status") == "ok"
    except Exception as e:
        print(f"[Test] /status failed: {e}")
        return False

    # 2. Pull simulation
    try:
        dummy_files = {
            "test_sample.ts": "// Test sample code\nexport const TEST_VAL = 42;\n",
            "components/TestBox.tsx": "// Test component\nexport function TestBox() { return null; }\n"
        }
        data = json.dumps({"files": dummy_files}).encode("utf-8")
        req = urllib.request.Request(
            f"{BASE_URL}/pull",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        res = json.loads(urllib.request.urlopen(req, timeout=3).read().decode())
        print(f"[Test] /pull OK: {res}")
        assert res.get("saved_count") == 2
    except Exception as e:
        print(f"[Test] /pull failed: {e}")
        return False

    # 3. Verify files on disk
    src_dir = Path(__file__).resolve().parent.parent / "src"
    test_file = src_dir / "test_sample.ts"
    if test_file.exists() and "TEST_VAL = 42" in test_file.read_text(encoding="utf-8"):
        print("[Test] File verified on local disk!")
    else:
        print("[Test] File verification failed!")
        return False

    # Clean up test files
    try:
        test_file.unlink(missing_ok=True)
        (src_dir / "components" / "TestBox.tsx").unlink(missing_ok=True)
        if (src_dir / "components").exists() and not any((src_dir / "components").iterdir()):
            (src_dir / "components").rmdir()
        print("[Test] Cleaned up test files.")
    except Exception as e:
        print(f"[Test] Cleanup note: {e}")

    print("[Test] ALL BRIDGE TESTS PASSED!")
    return True

if __name__ == "__main__":
    test_bridge()
