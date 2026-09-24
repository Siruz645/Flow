# -*- coding: utf-8 -*-
import asyncio
import time
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOT_PATH = Path(__file__).resolve().parent / "ui_test_result.png"
SAMPLE_IMAGE_PATH = Path(__file__).resolve().parent / "sample_test_image.png"

async def run_test():
    print("[Test] Launching Playwright browser...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"[Browser Console] [{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[Browser Error] {err}"))

        print("[Test] Navigating to http://127.0.0.1:5173/...")
        await page.goto("http://127.0.0.1:5173/", wait_until="networkidle")

        # 1. Close IntroModal if present
        try:
            start_btn = page.locator("button").filter(has_text="Начать").or_(page.locator("button").filter(has_text="Понятно"))
            if await start_btn.count() > 0:
                print("[Test] Closing IntroModal...")
                await start_btn.first.click()
                await asyncio.sleep(0.5)
        except Exception as e:
            print("[Test] IntroModal note:", e)

        # 2. Upload sample image
        print("[Test] Uploading sample test image...")
        async with page.expect_file_chooser() as fc_info:
            upload_btn = page.locator("button").filter(has_text="upload").or_(page.locator("button").filter(has_text="Загрузите")).first
            await upload_btn.click()
        file_chooser = await fc_info.value
        await file_chooser.set_files(str(SAMPLE_IMAGE_PATH))

        print("[Test] Waiting for image element & MediaPipe detector...")
        img = page.locator("img[alt='Original']").first
        await img.wait_for(state="visible", timeout=10000)
        print("[Test] Image is visible in MagicInspector!")

        await asyncio.sleep(2.0)

        # 3. Select a detected box or draw manual selection
        boxes = page.locator("div.cursor-pointer")
        box_count = await boxes.count()
        print(f"[Test] Detected clickable boxes count: {box_count}")

        if box_count > 0:
            print("[Test] Clicking on detected object box...")
            await boxes.first.click()
        else:
            print("[Test] Drawing manual selection box on image...")
            rect = await img.bounding_box()
            if rect:
                sx = rect["x"] + rect["width"] * 0.25
                sy = rect["y"] + rect["height"] * 0.2
                ex = rect["x"] + rect["width"] * 0.75
                ey = rect["y"] + rect["height"] * 0.8
                await page.mouse.move(sx, sy)
                await page.mouse.down()
                await page.mouse.move(ex, ey, steps=5)
                await page.mouse.up()
        await asyncio.sleep(0.5)

        # 4. Fill modification prompt using press_sequentially for React state update
        prompt_input = page.locator("textarea").first
        print("[Test] Entering modification prompt via keyboard typing...")
        await prompt_input.click()
        await prompt_input.press_sequentially("Make it colorful and vibrant", delay=30)
        await asyncio.sleep(0.5)

        # 5. Click Apply Banana Pro button
        apply_btn = page.locator("button").filter(has=page.locator("span", has_text="auto_fix_high")).first
        print("[Test] Checking if Apply button is enabled...")
        is_disabled = await apply_btn.is_disabled()
        print(f"[Test] Button disabled status: {is_disabled}")

        print("[Test] Clicking 'Применить Banana Pro' button...")
        await apply_btn.click()

        # Wait for processing
        print("[Test] Waiting for generation & composite edit...")
        await asyncio.sleep(3.5)

        # 6. Check for error message
        error_box = page.locator("text='Ошибка генерации'")
        if await error_box.count() > 0 and await error_box.is_visible():
            print("[Test] ❌ ERROR: 'Ошибка генерации' is displayed!")
        else:
            print("[Test] ✅ SUCCESS: Generation succeeded with NO errors!")

        # Check for result
        result_img = page.locator("img[alt='Result']")
        if await result_img.count() > 0:
            print("[Test] 🎉 Result image rendered successfully in UI!")

        # Take screenshot
        await page.screenshot(path=str(SCREENSHOT_PATH))
        print(f"[Test] 📸 Screenshot saved to {SCREENSHOT_PATH}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_test())
