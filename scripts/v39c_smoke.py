#!/usr/bin/env python3
"""v39c UI 스모크 — 844×390 90분 완주 · 전력 표시/qapGap · 회전 안내 · 오류/4xx.

사용: python3 scripts/v39c_smoke.py [출력폴더]
환경: URL 을 직접 주면 라이브 검증에 쓴다 (예: URL='https://.../?v=39&b=41' python3 scripts/v39c_smoke.py ...)
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ.get('LD_LIBRARY_PATH', ''))
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8240'))
B = os.environ.get('BUILD', '41')
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{ROOT}/preview/v39c'
os.makedirs(OUT, exist_ok=True)
LIVE = os.environ.get('URL')
URL = LIVE or f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'
TAG = os.environ.get('TAG', 'v39c')

srv = None
if not LIVE:
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
res = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs, cons, bad = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' else None)
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)
        res['build'] = pg.evaluate("""() => ({
          match: (document.querySelector('script[src*="match.js"]')||{}).src,
          game: (document.querySelector('script[src*="game.js"]')||{}).src,
          cards: DS.CARDS ? DS.CARDS.length : 0,
          expToNext0: DS.expToNext(0), LEVEL_GAIN: DS.LEVEL_GAIN,
          hasQaCfg: typeof DS.game.qaCfg === 'function'
        })""")
        pg.evaluate("""() => { const S = DS.game.state(); S.tut = {done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }""")
        # 전력 표시 vs 상대 strength vs 경기 gap
        res['power'] = pg.evaluate("""() => {
          const G = DS.game, S = G.state();
          let opp = null; DS.TEAMS.forEach(t => { if (t.division === 2 && (!opp || t.strength < opp.strength)) { opp = t; } });
          const q = G.qaCfg('smatch', { teamId: opp.id });
          return { teamPower: G.teamPower(), opp: opp.short, oppStrength: opp.strength,
                   homePower: q.cfg.homePower, awayPower: q.cfg.awayPower, awayFormation: q.awayFormation,
                   homeRaw: q.homeRawAvg, awayRaw: q.awayRawAvg };
        }""")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2200)
        res['kickGap'] = pg.evaluate("() => DS.Match.v33().gap")
        res['full'] = pg.evaluate("""() => new Promise(resolve => {
          let n = 0, t0 = performance.now();
          function tick() {
            n++;
            if (n < 90) { requestAnimationFrame(tick); return; }
            const dt = (performance.now() - t0) / 1000;
            const r = DS.Match.qaSim();
            setTimeout(() => resolve({ fps: Math.round(n / dt * 10) / 10, res: r,
              phase: DS.Match.phase, clock: DS.Match.clock, running: DS.Match.running,
              tokens: (DS.Match.probe ? DS.Match.probe().art : null),
              lane: DS.Match.v35().lanesAtk, laneSide: DS.Match.v39().atkLaneSide,
              offside: DS.Match.v33().offside, pass: DS.Match.v39().passDir,
              backBlocked: DS.Match.v39().atkThirdBackBlocked, halfBlocked: DS.Match.v39().atkHalfBackBlocked }), 900);
          }
          requestAnimationFrame(tick);
        })""")
        pg.wait_for_timeout(1200)
        # 하프타임 교체 추천 등 오버레이를 닫고 결과서를 띄운다
        pg.evaluate("""() => {
          ['m-overlay', 'm-advice'].forEach(id => { const el = document.getElementById(id);
            if (el) { el.classList.remove('on'); el.innerHTML = ''; } });
          const m = document.getElementById('modal');
          if (m && m.className.indexOf('on') >= 0) { m.className = ''; m.innerHTML = ''; }
          const S = DS.game.state();
          if (S.lastReport) { DS.game.showReport(S.lastReport); }
        }""")
        pg.wait_for_timeout(900)
        pg.screenshot(path=f'{OUT}/{TAG}-result-844x390.png')
        # 세로 회전 안내
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.wait_for_timeout(900)
        res['rotate'] = pg.evaluate("""() => { const r = document.getElementById('rotate');
          return r ? { display: getComputedStyle(r).display, opacity: getComputedStyle(r).opacity } : null; }""")
        pg.screenshot(path=f'{OUT}/{TAG}-rotate-390x844.png')
        res['errs'] = errs[:6]; res['console'] = cons[:8]; res['bad'] = bad[:8]
        res['dsErrs'] = pg.evaluate("() => (window.__DS_ERRS || []).slice(0,6)")
        b.close()
finally:
    if srv:
        srv.terminate()
print(json.dumps(res, ensure_ascii=False, indent=1))
