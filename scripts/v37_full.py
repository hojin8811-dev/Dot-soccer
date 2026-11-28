#!/usr/bin/env python3
"""v37 정식 검증 — 844×390 공식전 90분 완주 · 844×360 · 390×844 회전 안내 · fps · 오류 · 초상화 토큰 로드.

사용법: python3 scripts/v37_full.py [OUT_DIR] [all|844x390|844x360|390x844]
출력: OUT_DIR/v37-match.png · v37-closeup.png · v37-result-*.png · v37-rotate-*.png
"""
import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v37')
PORT = 8127
URL = 'http://127.0.0.1:%d/index.html?v=37&b=36' % PORT

STATE = """(() => {
  const M = DS.Match, md = document.getElementById('modal');
  let clock = 0, phase = '', scor = [0, 0], paused = false, half = false;
  try { clock = M.clock; phase = M.phase; scor = [M.homeScore, M.awayScore]; paused = M.paused; half = !!M.halftime; } catch (e) {}
  const ov = document.getElementById('m-overlay');
  const modal = ((md && md.innerHTML) ? md.innerHTML.length : 0) + ((ov && ov.innerHTML) ? ov.innerHTML.length : 0);
  const advstart = !!(document.querySelector('[data-act="advstart"]'));
  let pr = null;
  try { pr = M.probe(); } catch (e) {}
  return JSON.stringify({ clock: Math.round(clock * 10) / 10, phase: phase, score: scor, paused: paused, half: half,
    modal: modal, advstart: advstart,
    errs: (window.__DS_ERRS || []).length,
    players: pr ? (pr.home.length + pr.away.length) : null,
    tokenR: pr && pr.view ? pr.view.tokenR : null,
    camZ: pr && pr.view ? pr.view.camZ : null,
    screen: (document.querySelector('.screen.on') || {}).id || '' });
})()"""


async def run_page(b, W, H, tag):
    pg = await b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
    logs = []
    pg.on('console', lambda m: logs.append('%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: %s' % e))
    pg.on('response', lambda r: logs.append('HTTP %s: %s' % (r.status, r.url)) if r.status >= 400 else None)
    await pg.goto(URL, wait_until='networkidle')
    await pg.wait_for_timeout(1500)
    if W < H:
        vis = await pg.evaluate("(() => { const r = document.getElementById('rotate'); return r ? getComputedStyle(r).display + '/' + getComputedStyle(r).opacity : 'none'; })()")
        print(tag, 'rotate overlay', vis)
        await pg.screenshot(path=os.path.join(OUT, 'v37-rotate-%s.png' % tag))
        await pg.close()
        return
    print(tag, 'loaded errs', await pg.evaluate('JSON.stringify(window.__DS_ERRS)'))
    await pg.evaluate("DS.game.act('kickoff')")
    await pg.wait_for_timeout(2800)
    # 초상화 토큰 로드 확인 — 피치 22명 두상 이미지가 실제로 그려졌는지
    heads = await pg.evaluate("""(() => {
      try {
        const pr = DS.Match.probe();
        return JSON.stringify({ n: pr.players.length, view: pr.view, errs: (window.__DS_ERRS || []) });
      } catch (e) { return 'ERR ' + e; }
    })()""")
    print(tag, 'probe', heads)
    await pg.evaluate('DS.Match.setSpeed(3)')
    st = {}
    half_done = False
    shot_match = shot_close = False
    result_shot = False
    for i in range(520):
        await pg.wait_for_timeout(350)
        try:
            st = json.loads(await pg.evaluate(STATE))
        except Exception:
            continue
        if not shot_match and st.get('clock', 0) > 2.2 and st.get('phase') in ('pass', 'play', 'dribble', 'shot'):
            await pg.screenshot(path=os.path.join(OUT, 'v37-match.png'))
            await pg.screenshot(path=os.path.join(OUT, 'v37-closeup.png'),
                                clip={'x': 150, 'y': 110, 'width': 340, 'height': 190})
            shot_match = shot_close = True
        if (st.get('advstart') or (st.get('half') and st.get('modal'))) and not half_done:
            half_done = True
            await pg.screenshot(path=os.path.join(OUT, 'v37-half-%s.png' % tag))
            sel = '[data-act="advstart"]' if st.get('advstart') else '[data-act="subclose"]'
            try:
                await pg.click(sel)
            except Exception as e:
                print(tag, 'half click fail', sel, e)
            print(tag, 'halftime ->', sel, 'at', st.get('clock'))
            continue
        if st.get('phase') == 'ended' or st.get('clock', 0) >= 91:
            await pg.wait_for_timeout(1200)
            st = json.loads(await pg.evaluate(STATE))
            if not result_shot:
                await pg.screenshot(path=os.path.join(OUT, 'v37-result-%s.png' % tag))
                result_shot = True
            break
        if i % 20 == 0:
            print(tag, 't', st.get('clock'), st.get('phase'), st.get('screen'), 'modal', st.get('modal'), 'tokenR', st.get('tokenR'), 'camZ', st.get('camZ'), flush=True)
        if st.get('modal') and st.get('clock', 0) < 45:
            try:
                await pg.click('#modal button')
            except Exception:
                pass
    print(tag, 'final', st, flush=True)
    fps = await pg.evaluate("""(async () => {
      let n = 0, t0 = performance.now();
      await new Promise(res => { function tick(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
      return Math.round(n / ((performance.now()-t0)/1000) * 10) / 10;
    })()""")
    print(tag, 'fps', fps, flush=True)
    print(tag, 'errs', await pg.evaluate('JSON.stringify(window.__DS_ERRS)'))
    print(tag, 'logs', logs[:12])
    try:
        await pg.click('#modal button')
    except Exception:
        pass
    await pg.wait_for_timeout(700)
    await pg.screenshot(path=os.path.join(OUT, 'v37-after-%s.png' % tag))
    await pg.close()


async def main():
    os.makedirs(OUT, exist_ok=True)
    srv = await asyncio.create_subprocess_shell('python3 -m http.server %d' % PORT, cwd=ROOT,
                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await asyncio.sleep(1.2)
    env = dict(os.environ)
    env['LD_LIBRARY_PATH'] = LIBS + ':' + env.get('LD_LIBRARY_PATH', '')
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(env=env, args=['--no-sandbox'])
            want = sys.argv[2] if len(sys.argv) > 2 else 'all'
            if want in ('all', '844x390'):
                await run_page(b, 844, 390, '844x390')
            if want in ('all', '844x360'):
                await run_page(b, 844, 360, '844x360')
            if want in ('all', '390x844'):
                await run_page(b, 390, 844, '390x844')
            await b.close()
    finally:
        srv.kill()

asyncio.run(main())
