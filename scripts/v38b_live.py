#!/usr/bin/env python3
"""v38b 라이브 검증 — https://hojin8811-dev.github.io/Dot-soccer/?v=38&b=38
마이팀 레이아웃 계측 · 90분 완주 · 공 클로즈업 · 오류/토큰. 사용: python3 scripts/v38b_live.py [출력폴더]
"""
import json, os, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
from PIL import Image

CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
URL = 'https://hojin8811-dev.github.io/Dot-soccer/?v=38&b=38'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join('/workspace/dot-soccer-v18', 'preview', 'v38b')
os.makedirs(OUT, exist_ok=True)
res = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
        errs, cons, bad = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' else None)
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url[-60:]}') if r.status >= 400 else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; S.morale=74; S.form=['L','L','L','W','W']; S.condition=95; DS.game.save(); DS.game.renderAll(); }")
        # 마이팀
        pg.click('[data-tab="squad"]')
        pg.wait_for_timeout(1100)
        res['squad'] = pg.evaluate("""(() => { const q=s=>document.querySelector(s), r=e=>{const b=e.getBoundingClientRect();return{y:Math.round(b.y),h:Math.round(b.height),bottom:Math.round(b.bottom)}};
          const main=q('main');
          return {pitch:r(q('.sq-pitch')), bench:r(q('.sq-bench')), mainScroll:main.scrollHeight-main.clientHeight,
                  rightScroll:(()=>{const s=q('.sq-right');return s.scrollHeight-s.clientHeight})(),
                  synDisplay:getComputedStyle(q('.sq-syn')).display, pitchInView:q('.sq-pitch').getBoundingClientRect().bottom<=innerHeight+0.5}; })()""")
        pg.screenshot(path=os.path.join(OUT, 'v38b-live-squad-844x390.png'))
        # 경기
        pg.click('[data-tab="home"]')
        pg.wait_for_timeout(400)
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(3200)
        pg.screenshot(path=os.path.join(OUT, 'v38b-live-match-844x390.png'))
        bs = pg.evaluate("() => DS.Match.ballScreen()")
        if bs:
            im = Image.open(os.path.join(OUT, 'v38b-live-match-844x390.png'))
            k = 2
            crop = im.crop((max(0, (bs['x'] - 80) * k), max(0, (bs['y'] - 80) * k),
                            min(im.width, (bs['x'] + 80) * k), min(im.height, (bs['y'] + 80) * k)))
            crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(os.path.join(OUT, 'v38b-live-ball-zoom.png'))
            res['ball'] = bs
        res['fps'] = pg.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now();
            const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); };
            requestAnimationFrame(f); })""")
        pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
        t0 = time.time()
        while time.time() - t0 < 190:
            st = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, running:p.running, paused:p.paused, half:p.halftime}; })()")
            if st['paused'] and st['half']:
                if pg.locator('[data-act="advstart"]').count():
                    pg.click('[data-act="advstart"]')
                pg.wait_for_timeout(300)
                continue
            if not st['running']:
                break
            pg.wait_for_timeout(1500)
        pg.wait_for_timeout(1800)
        res['full'] = pg.evaluate("(() => { const p=DS.Match.probe(); const r=DS.game.state().lastReport; return {clock:p.clock, running:p.running, tokens:p.view.portraitsReady+'/'+p.view.portraitsTotal, score:r?[r.homeScore,r.awayScore]:null, shots:r?r.shots:null}; })()")
        res['errs'] = errs + pg.evaluate("() => (window.__DS_ERRS||[])")
        res['console'] = cons[:5]
        res['http4xx'] = bad[:5]
        b.close()
finally:
    pass
print(json.dumps(res, ensure_ascii=False, indent=1))
