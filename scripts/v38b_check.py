#!/usr/bin/env python3
"""v38b 종합 검증 — 마이팀 전술판 레이아웃(844×390·915×412), 경기 90분 완주 + 공 스크린샷,
세로 회전 안내, 콘솔/페이지 오류·초상화 토큰 확인.
사용: python3 scripts/v38b_check.py [출력폴더] [all|squad|match|rotate]
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8156'))
B = os.environ.get('BUILD', '38')
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b={B}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v38b')
WHAT = sys.argv[2] if len(sys.argv) > 2 else 'all'
os.makedirs(OUT, exist_ok=True)

MEASURE = r"""
() => {
  const q = s => document.querySelector(s);
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const sq = q('.sq'), pitch = q('.sq-pitch'), right = q('.sq-right'), bench = q('.sq-bench'), main = q('main'), scr = q('#screen-squad'), syn = q('.sq-syn');
  const vh = innerHeight;
  return {
    vp: [innerWidth, vh], screen: r(scr), sq: r(sq), pitch: r(pitch), bench: r(bench), right: r(right), syn: r(syn),
    mainScroll: main ? main.scrollHeight - main.clientHeight : null,
    rightScroll: right ? right.scrollHeight - right.clientHeight : null,
    pitchInView: pitch ? pitch.getBoundingClientRect().bottom <= vh + 0.5 : null,
    benchInView: bench ? bench.getBoundingClientRect().bottom <= vh + 0.5 : null,
    synDisplay: syn ? getComputedStyle(syn).display : null,
    synRows: [...document.querySelectorAll('.sq-syn .row')].length,
    synFxH: (() => { const e = q('.sq-syn .syn-fx'); return e ? Math.round(e.getBoundingClientRect().height) : null; })(),
    synChips: [...document.querySelectorAll('.sq-syn .chip')].map(e => Math.round(e.getBoundingClientRect().height))
  };
}
"""

res = {}
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


def fresh(pg):
    pg.goto(URL, wait_until='load')
    pg.evaluate("localStorage.clear()")
    pg.goto(URL, wait_until='load')
    pg.wait_for_timeout(1100)
    pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; S.morale=74; S.form=['L','L','L','W','W']; S.condition=95; DS.game.save(); DS.game.renderAll(); }")


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)

        # ── 1) 마이팀 레이아웃 두 가로 뷰포트 ──
        if WHAT in ('all', 'squad'):
            for (w, h) in [(844, 390), (915, 412)]:
                pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
                errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
                fresh(pg)
                pg.click('[data-tab="squad"]')
                pg.wait_for_timeout(800)
                key = f'{w}x{h}'
                res[f'squad_{key}'] = pg.evaluate(MEASURE)
                pg.screenshot(path=os.path.join(OUT, f'v38b-squad-{key}.png'))
                # 오른쪽 열을 라커룸 성향까지 스크롤
                pg.evaluate("() => { const s=document.querySelector('.sq-right'); const c=document.querySelector('.sq-syn'); s.scrollTop = c.offsetTop - s.offsetTop - 8; }")
                pg.wait_for_timeout(350)
                pg.screenshot(path=os.path.join(OUT, f'v38b-squad-right-{key}.png'))
                res[f'squad_{key}']['errs'] = errs + pg.evaluate("() => (window.__DS_ERRS||[])")
                pg.close()

        # ── 2) 경기 90분 완주 + 공/화면 스크린샷 ──
        if WHAT in ('all', 'match'):
            pg = b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
            errs, cons = [], []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            pg.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' else None)
            fresh(pg)
            pg.click('#screen-home [data-act="kickoff"]')
            pg.wait_for_timeout(2600)
            balls = []
            from PIL import Image
            for i in range(8):
                pg.wait_for_timeout(1200)
                bs = pg.evaluate("() => DS.Match.ballScreen()")
                if not bs:
                    continue
                balls.append(bs)
                if i in (1, 4, 7):
                    full = os.path.join(OUT, f'v38b-match-{i}-844x390.png')
                    pg.screenshot(path=full)
                    im = Image.open(full)
                    k = 2  # device_scale_factor
                    box = (max(0, (bs['x'] - 80) * k), max(0, (bs['y'] - 80) * k),
                           min(im.width, (bs['x'] + 80) * k), min(im.height, (bs['y'] + 80) * k))
                    crop = im.crop(box)
                    crop.save(os.path.join(OUT, f'v38b-ball-{i}-844x390.png'))
                    crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST).save(
                        os.path.join(OUT, f'v38b-ball-zoom-{i}-844x390.png'))
            res['balls'] = balls
            fps = pg.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now();
                const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); };
                requestAnimationFrame(f); })""")
            res['fps'] = fps
            res['tokens'] = pg.evaluate("() => { const p = DS.Match.probe(); return { ready: p.view.portraitsReady, total: p.view.portraitsTotal, n: p.players }; }")
            # 나머지는 터보로 끝까지
            pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
            t0 = time.time()
            while time.time() - t0 < 200:
                st = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, running:p.running, paused:p.paused, half:p.halftime, phase:p.phase}; })()")
                if st['paused'] and st['half']:
                    if pg.locator('[data-act="advstart"]').count():
                        pg.click('[data-act="advstart"]')
                    pg.wait_for_timeout(300)
                    continue
                if not st['running'] or st['phase'] == 'ended':
                    break
                pg.wait_for_timeout(1500)
            pg.wait_for_timeout(1800)
            res['full'] = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, phase:p.phase, running:p.running, home:DS.Match.homeScore, away:DS.Match.awayScore}; })()")
            res['result'] = pg.evaluate("(() => { const r=DS.game.state().lastReport; return r ? {gf:r.homeScore, ga:r.awayScore, shots:r.shots, xg:r.xg, poss:r.possession} : null; })()")
            pg.screenshot(path=os.path.join(OUT, 'v38b-result-844x390.png'))
            res['errs'] = errs + pg.evaluate("() => (window.__DS_ERRS||[])")
            res['console'] = cons[:6]
            pg.close()

        # ── 3) 세로 회전 안내 ──
        if WHAT in ('all', 'rotate'):
            pg = b.new_page(viewport={'width': 390, 'height': 844})
            fresh(pg)
            pg.wait_for_timeout(400)
            res['rotate'] = pg.evaluate("(() => { const e=document.querySelector('#rotate'); const cs=getComputedStyle(e); return {display:cs.display, opacity:cs.opacity, text:e.innerText.replace(/\\n/g,' | ')}; })()")
            pg.screenshot(path=os.path.join(OUT, 'v38b-rotate-390x844.png'))
            pg.close()
        b.close()
finally:
    srv.terminate()

print(json.dumps(res, ensure_ascii=False, indent=1))
