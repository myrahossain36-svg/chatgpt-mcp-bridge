import asyncio, subprocess, os
from playwright.async_api import async_playwright
FPS=30
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1280,"height":720})
        await pg.goto("file://" + __import__("os").path.abspath("demo.html") + ""); await pg.wait_for_timeout(300)
        scenes=await pg.evaluate("window.SCENES")
        for name,dur in scenes.items():
            tmp=f"scene_{name}.tmp.mp4"
            ff=subprocess.Popen(["ffmpeg","-y","-loglevel","error","-f","image2pipe","-framerate",str(FPS),"-c:v","mjpeg","-i","-",
                "-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-r",str(FPS),tmp],stdin=subprocess.PIPE)
            for i in range(round(dur*FPS)):
                await pg.evaluate(f"render('{name}',{i/FPS})")
                ff.stdin.write(await pg.screenshot(type="jpeg",quality=92))
            ff.stdin.close(); rc=ff.wait()
            if rc==0: os.replace(tmp,f"scene_{name}.mp4")
            print(name,rc,flush=True)
        await b.close()
asyncio.run(main())
