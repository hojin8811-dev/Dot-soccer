#!/usr/bin/env python3
"""v37 라이브 검증 — 실제 배포 URL에서 90분 완주 · fps · 오류 · 스샷.

사용법: python3 scripts/v37_live.py [OUT_DIR]
"""
import asyncio
import json
import os
import sys
import urllib.request

from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v37')
BASE = 'https://hojin8811-dev.github.io/Dot-soccer/'
URL = BASE + '?v=37&b=36'
INDEX = BASE + 'index.html?cb=%d'

STATE = """(() => {
  const M = DS.Match, md = document.getElementById('modal'), ov = document.getElementById('m-overlay');
  let clock = 0, phase = '', half = false, score = [0, 0];
  try { clock = M.clock; phase = M.phase; half = !!M.halftime; score = [M.homeScore, M.awayScore]; } catch (e) {}
  const modal = ((md && md.innerHTML) ? md.innerHTML.length : 0) + ((ov && ov.innerHTML) ? ov.innerHTML.length : 0);
  const advstart = !!document.querySelector('[data-act="advstart"]');
  let ready = null;
  try { ready = M.probe().view; } catch (e) {}
  return JSON.stringify({ clock: Math.round(clock * 10) / 10, phase: phase, half: half, score: score,
    modal: modal, advstart: advstart, errs: (window.__DS_ERRS || []).length,
    portraits: ready ? [ready.portraitsReady, ready.portraitsTotal] : null });
})()"""


async def wait_deploy():
    for i in range(40):
        try:
            req = urllib.request.Request(INDEX % i, headers={'Cache-Control': 'no-cache'})
            body = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'ignore')
            if 'b=36' in body and 'v37' in body:
                print('deploy visible (v37 / b=36) after', i + 1, 'polls', flush=True)
                return True
        except Exception as e:
            print('poll', i, e, flush=True)
        await asyncio.sleep(10)
    print('deploy NOT visible', flush=True)
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
        await pg.wait_for_timeout(2000)
        heads = await pg.evaluate("JSON.stringify((() => { const v = DS.Match.probe().view; return v; })())")
        print('view', heads, flush=True)
        await pg.evaluate("DS.game.act('kickoff')")
        await pg.wait_for_timeout(2800)
        print('portraits', await pg.evaluate("JSON.stringify(DS.Match.probe().view.portraitsReady)"), flush=True)
        await pg.evaluate('DS.Match.setSpeed(3)')
        st = {}
        shot_match = shot_close = False
        half_done = result = False
        for i in range(520):
            await pg.wait_for_timeout(350)
            try:
                st = json.loads(await pg.evaluate(STATE))
            except Exception:
                continue
            if not shot_match and st.get('clock', 0) > 2 and st.get('phase') in ('pass', 'play', 'dribble', 'shot'):
                await pg.screenshot(path=os.path.join(OUT, 'v37-match.png'))
                await pg.screenshot(path=os.path.join(OUT, 'v37-closeup.png'),
                                    clip={'x': 150, 'y': 110, 'width': 340, 'height': 190})
                shot_match = shot_close = True
                print('shots at', st.get('clock'), flush=True)
            if st.get('advstart') and not half_done:
                half_done = True
                await pg.click('[data-act="advstart"]')
                print('halftime at', st.get('clock'), flush=True)
                continue
            if st.get('phase') == 'ended' or st.get('clock', 0) >= 90:
                await pg.wait_for_timeout(1200)
                st = json.loads(await pg.evaluate(STATE))
                if not result:
                    await pg.screenshot(path=os.path.join(OUT, 'v37-live-result.png'))
                    result = True
                break
            if i % 20 == 0:
                print('t', st.get('clock'), st.get('phase'), 'modal', st.get('modal'), 'errs', st.get('errs'), flush=True)
            if st.get('modal') and st.get('clock', 0) < 45:
                try:
                    await pg.click('#modal button')
                except Exception:
                    pass
        print('final', st, flush=True)
        fps = await pg.evaluate("""(async () => {
          let n = 0, t0 = performance.now();
          await new Promise(res => { function tick(){ n++; if (performance.now()-t0 < 2500) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
          return Math.round(n / ((performance.now()-t0)/1000) * 10) / 10;
        })()""")
        print('fps', fps, flush=True)
        print('errs', await pg.evaluate('JSON.stringify(window.__DS_ERRS)'), flush=True)
        print('logs', logs[:12], flush=True)
        print('shots', shot_match, shot_close, flush=True)
        await b.close()

asyncio.run(main())
