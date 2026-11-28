#!/usr/bin/env python3
"""v38 밸런스 샘플 — 공식전 3경기를 터보로 완주해 스코어·슈팅·xG·0:0 비율을 본다.
(라커룸 성향·커스텀 전술 변경이 득점 흐름을 망가뜨리지 않았는지 확인용)
"""
import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8146
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=37'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
games = []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1100)
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }")
        for n in range(3):
            pg.evaluate("() => { const S=DS.game.state(); S.condition=100; DS.game.save(); DS.game.renderAll(); }")
            pg.click('#screen-home [data-act="kickoff"]')
            pg.wait_for_timeout(2200)
            pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
            t0 = time.time()
            while time.time() - t0 < 140:
                st = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, running:p.running, paused:p.paused, half:p.halftime}; })()")
                if st['paused'] and st['half']:
                    if pg.locator('[data-act="advstart"]').count():
                        pg.click('[data-act="advstart"]')
                    pg.wait_for_timeout(300)
                    continue
                if not st['running']:
                    break
                pg.wait_for_timeout(1200)
            pg.wait_for_timeout(1400)
            rep = pg.evaluate("(() => { const r=DS.game.state().lastReport; if(!r) return null; return {gf:r.homeScore, ga:r.awayScore, shots:r.shots, xg:r.xg, poss:r.possession, mvp:r.mvp&&r.mvp.name}; })()")
            games.append(rep)
            try:
                pg.click('[data-act="closemodal"]')
            except Exception:
                pass
            pg.wait_for_timeout(500)
            pg.evaluate("DS.game.act('tab', document.querySelector('.tabbar button[data-tab=\"home\"]'))")
            pg.wait_for_timeout(400)
        b.close()
finally:
    srv.terminate()
tot = len(games)
goals = sum((g or {}).get('gf', 0) + (g or {}).get('ga', 0) for g in games if g)
nil = sum(1 for g in games if g and g['gf'] == 0 and g['ga'] == 0)
print(json.dumps({'games': games, 'n': tot, 'goals': goals, 'nil_nil': nil}, ensure_ascii=False, indent=1))
