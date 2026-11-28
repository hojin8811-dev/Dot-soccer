#!/usr/bin/env python3
"""v38 시각 확인 — 마이팀 우측(커스텀 전술·분위기), 선수 상세 하단(성장·세트), 이적시장 비교카드."""
import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8142
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=37'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v38')
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
res = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1100)
        pg.evaluate("() => { const S=DS.game.state(); S.morale=74; S.form=['L','L','L','W','W']; DS.game.save(); DS.game.renderAll(); }")
        pg.click('.tabbar button[data-tab="squad"]')
        pg.wait_for_timeout(500)
        pg.evaluate("document.querySelector('.sq-ctac').scrollIntoView({block:'center'})")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, 'v38-squad-aside-844x390.png'))
        # 상세 하단
        pg.click('.sq-bench .pinfo')
        pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('#modal .sheet-body').scrollTop = 100000")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, 'v38-detail-bottom-844x390.png'))
        res['detail_scroll'] = pg.evaluate("(() => { const b=document.querySelector('#modal .sheet-body'); return {h:b.clientHeight, sh:b.scrollHeight, top:b.scrollTop}; })()")
        pg.click('#modal .x')
        # 이적시장 비교 카드 위치
        pg.click('.tabbar button[data-tab="shop"]')
        pg.wait_for_timeout(700)
        pg.click('.mkt.pclick')
        pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('#modal .sheet-body').scrollTop = 120")
        pg.wait_for_timeout(250)
        pg.screenshot(path=os.path.join(OUT, 'v38-market-compare2-844x390.png'))
        res['cmp_y'] = pg.evaluate("(() => { const c=document.querySelector('#modal .cmp-card'); const b=document.querySelector('#modal .sheet-body'); if(!c) return null; return {offsetTop:c.offsetTop, bodyTop:b.scrollTop, h:b.clientHeight}; })()")
        b.close()
finally:
    srv.terminate()
print(json.dumps(res, ensure_ascii=False))
