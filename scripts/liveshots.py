#!/usr/bin/env python3
"""v36 라이브 검증샷 — 실제 배포 URL에서 경기 화면·클로즈업·골/태클 장면을 캡처한다.

사용법: python3 scripts/liveshots.py [OUT_DIR]
출력: OUT_DIR/live-match.png · live-closeup.png · live-tackle-or-goal.png
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://hojin8811-dev.github.io/Dot-soccer/?v=36&b=34'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v36')

STATE = """(() => {
  const M = DS.Match;
  let tackle = false, dive = false, goal = 0;
  try {
    const pr = M.probe();
    const all = pr.home.concat(pr.away);
    tackle = all.some(r => r.pose === 'tackle');
    dive = all.some(r => r.pose === 'dive');
    goal = M.homeScore + M.awayScore;
  } catch (e) {}
  return JSON.stringify({ clock: M.clock, phase: M.phase, tackle, dive, goal,
    score: [M.homeScore, M.awayScore], errs: (window.__DS_ERRS || []).length });
})()"""


async def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ)
    env['LD_LIBRARY_PATH'] = LIBS + ':' + env.get('LD_LIBRARY_PATH', '')
    async with async_playwright() as p:
        b = await p.chromium.launch(env=env, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        pg.on('response', lambda r: logs.append(f'HTTP {r.status}: {r.url}') if r.status >= 400 else None)
        await pg.goto(URL, wait_until='networkidle')
        await pg.wait_for_timeout(1500)
        await pg.evaluate("DS.game.act('kickoff')")
        await pg.wait_for_timeout(2600)
        await pg.evaluate("DS.Match.setSpeed(2)")

        got = {'match': False, 'close': False, 'action': False}
        st = {}
        for _ in range(600):
            await pg.wait_for_timeout(350)
            try:
                st = __import__('json').loads(await pg.evaluate(STATE))
            except Exception:
                continue
            if not got['match'] and st.get('clock', 0) > 1.5:
                await pg.screenshot(path=os.path.join(OUT, 'live-match.png'))
                await pg.screenshot(path=os.path.join(OUT, 'live-closeup.png'),
                                    clip={'x': 170, 'y': 120, 'width': 330, 'height': 170})
                got['match'] = got['close'] = True
            if got['match'] and (st.get('goal', 0) > 0 or st.get('tackle') or st.get('dive')):
                await pg.screenshot(path=os.path.join(OUT, 'live-tackle-or-goal.png'))
                got['action'] = True
                break
        # 90분 완주 검증
        fps = await pg.evaluate("""(async () => {
          let n = 0, t0 = performance.now();
          await new Promise(res => { function tick(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
          return Math.round(n / ((performance.now()-t0)/1000) * 10) / 10;
        })()""")
        print('fps', fps)
        print('state', st)
        print('captured', got)
        print('logs', logs[:10])
        await b.close()

asyncio.run(main())
