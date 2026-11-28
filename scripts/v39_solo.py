#!/usr/bin/env python3
"""v39 개인기 돌파 — 실제 새 세이브(유저 스쿼드 vs 2부 상대)로 90분을 돌려 돌파/슈팅/전개 계측."""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ.get('LD_LIBRARY_PATH') if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8172'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b=39'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3

per_game = []
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1400)
        pg.evaluate("""() => {
          const S = DS.game.state();
          S.tut = { done: true, step: 0, runs: 1 };
          S.condition = 90; S.morale = 70;
          DS.game.save(); DS.game.renderAll();
        }""")
        for i in range(N):
            pg.evaluate("() => { const b = document.querySelector('#screen-home [data-act=\"kickoff\"]'); if (b) { b.click(); } }")
            pg.wait_for_timeout(1800)
            r = pg.evaluate("""() => {
              const r = DS.Match.qaSim();
              return { home: r.home, away: r.away, shots: r.shots, xg: r.xg, poss: r.poss, gap: r.gap,
                       v39: DS.Match.v39() };
            }""")
            per_game.append(r)
            pg.wait_for_timeout(400)
            pg.evaluate("""() => { try { document.querySelector('#m-overlay [data-act=\"mclose\"], #m-result [data-act=\"close\"]') && document.querySelector('#m-overlay [data-act=\"mclose\"], #m-result [data-act=\"close\"]').click(); } catch(e){} }""")
            pg.wait_for_timeout(600)
        print(json.dumps({
            'games': [{k: g[k] for k in ['home', 'away', 'shots', 'xg', 'poss', 'gap']} for g in per_game],
            'solo': [g['v39']['solo'] for g in per_game],
            'soloBy': [g['v39']['soloBy'] for g in per_game],
            'soloTry': [g['v39']['soloTry'] for g in per_game],
            'act': per_game[0]['v39']['act'],
            'errs': errs[:4]
        }, ensure_ascii=False, indent=1))
        b.close()
finally:
    srv.terminate()
