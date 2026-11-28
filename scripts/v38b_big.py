import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu'
from playwright.sync_api import sync_playwright
ROOT='/workspace/dot-soccer-v18'; CHROME='/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT=8157
OUT=sys.argv[1] if len(sys.argv)>1 else '/workspace/v38b-qa'
srv=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROME)
        pg=b.new_page(viewport={'width':1920,'height':1080})
        pg.goto(f'http://127.0.0.1:{PORT}/index.html?v=38&b=38', wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(f'http://127.0.0.1:{PORT}/index.html?v=38&b=38', wait_until='load')
        pg.wait_for_timeout(1200)
        pg.click('[data-tab="squad"]')
        pg.wait_for_timeout(800)
        print(pg.evaluate("""(() => { const r=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
          return {pitch:r(document.querySelector('.sq-pitch')), bench:r(document.querySelector('.sq-bench')), right:r(document.querySelector('.sq-right'))}; })()"""))
        pg.screenshot(path=os.path.join(OUT,'squad-1920x1080.png'))
        b.close()
finally:
    srv.terminate()
