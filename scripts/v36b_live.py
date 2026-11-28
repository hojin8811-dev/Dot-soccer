#!/usr/bin/env python3
"""v36b 라이브 검증 — 실제 배포 URL에서 90분 완주 · fps · 오류 · 스샷 3장.

사용법: python3 scripts/v36b_live.py [OUT_DIR]
출력: OUT_DIR/v36b-match.png · v36b-closeup.png · v36b-away-check.png
"""
import asyncio
import json
import os
import sys
import urllib.request

from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v36b')
BASE = 'https://hojin8811-dev.github.io/Dot-soccer/'
URL = BASE + '?v=36&b=35'
INDEX = BASE + 'index.html?cb=%d'

STATE = """(() => {
  const M = DS.Match, md = document.getElementById('modal'), ov = document.getElementById('m-overlay');
  let clock = 0, phase = '', half = false, score = [0, 0];
  try { clock = M.clock; phase = M.phase; half = !!M.halftime; score = [M.homeScore, M.awayScore]; } catch (e) {}
  const modal = ((md && md.innerHTML) ? md.innerHTML.length : 0) + ((ov && ov.innerHTML) ? ov.innerHTML.length : 0);
  const advstart = !!document.querySelector('[data-act="advstart"]');
  return JSON.stringify({ clock: Math.round(clock * 10) / 10, phase: phase, half: half, score: score,
    modal: modal, advstart: advstart, errs: (window.__DS_ERRS || []).length });
})()"""


async def wait_deploy():
    """새 index.html(b=35)이 라이브에 올라올 때까지 기다린다."""
    for i in range(40):
        try:
            req = urllib.request.Request(INDEX % i, headers={'Cache-Control': 'no-cache'})
            body = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'ignore')
            if 'b=35' in body:
                print('deploy visible (b=35) after', i + 1, 'polls')
                return True
        except Exception as e:
            print('poll', i, e)
        await asyncio.sleep(15)
    print('deploy NOT visible')
    return False


async def main():
    os.makedirs(OUT, exist_ok=True)
    await wait_deploy()
    env = dict(os.environ)
    env['LD_LIBRARY_PATH'] = LIBS + ':' + env.get('LD_LIBRARY_PATH', '')
    async with async_playwright() as p:
        b = await p.chromium.launch(env=env, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
        logs = []
        pg.on('console', lambda m: logs.append('%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: %s' % e))
        pg.on('response', lambda r: logs.append('HTTP %s: %s' % (r.status, r.url)) if r.status >= 400 else None)
        await pg.goto(URL, wait_until='networkidle')
        await pg.wait_for_timeout(1500)
        print('pixel ready', await pg.evaluate('DS.PIXEL.ready()'))
        print('cell', await pg.evaluate('[DS.PIXEL.CELL_W, DS.PIXEL.CELL_H, DS.PIXEL.CX, DS.PIXEL.FEET, DS.PIXEL.SPR_H]'))
        await pg.evaluate("DS.game.act('kickoff')")
        await pg.wait_for_timeout(2800)
        await pg.evaluate('DS.Match.setSpeed(3)')

        st = {}
        shot_match = shot_close = shot_away = False
        half_done = False
        for i in range(900):
            await pg.wait_for_timeout(400)
            try:
                st = json.loads(await pg.evaluate(STATE))
            except Exception:
                continue
            if not shot_match and st.get('clock', 0) > 2 and st.get('phase') in ('pass', 'play', 'dribble'):
                await pg.screenshot(path=os.path.join(OUT, 'v36b-match.png'))
                await pg.screenshot(path=os.path.join(OUT, 'v36b-closeup.png'),
                                    clip={'x': 150, 'y': 120, 'width': 330, 'height': 180})
                shot_match = shot_close = True
            if shot_match and not shot_away:
                box = await pg.evaluate("""(() => {
                  const pr = DS.Match.probe(); const away = pr.away.filter(r => !r.gk);
                  const c = away.sort((a, b) => b.screen.scale - a.screen.scale)[0];
                  if (!c) return 'null';
                  return JSON.stringify({x: c.screen.x, y: c.screen.y, s: c.screen.scale});
                })()""")
                if box and box != 'null':
                    d = json.loads(box)
                    x = max(0, min(844 - 150, d['x'] - 75))
                    y = max(40, min(390 - 110, d['y'] + 40 - 85))
                    await pg.screenshot(path=os.path.join(OUT, 'v36b-away-check.png'),
                                        clip={'x': x, 'y': y, 'width': 150, 'height': 110})
                    shot_away = True
            if st.get('advstart') and not half_done:
                half_done = True
                await pg.click('[data-act="advstart"]')
                print('halftime at', st.get('clock'))
            if st.get('phase') == 'ended' or st.get('clock', 0) >= 91:
                break
        print('final', st)
        fps = await pg.evaluate("""(async () => {
          let n = 0, t0 = performance.now();
          await new Promise(res => { function tick(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
          return Math.round(n / ((performance.now()-t0)/1000) * 10) / 10;
        })()""")
        print('fps', fps)
        print('errs', await pg.evaluate('JSON.stringify(window.__DS_ERRS)'))
        print('logs', logs[:12])
        print('shots', shot_match, shot_close, shot_away)
        await b.close()

asyncio.run(main())
