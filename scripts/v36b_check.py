#!/usr/bin/env python3
"""v36b 로컬 검증 — 844×390 공식전 타전 · 스프라이트 4프레임 · 크기 · 오류 확인.

사용법: python3 scripts/v36b_check.py [OUT_DIR]
"""
import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v36b')
PORT = 8125


async def main():
    os.makedirs(OUT, exist_ok=True)
    srv = await asyncio.create_subprocess_shell(
        'python3 -m http.server %d' % PORT, cwd=ROOT,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await asyncio.sleep(1.2)
    env = dict(os.environ)
    env['LD_LIBRARY_PATH'] = LIBS + ':' + env.get('LD_LIBRARY_PATH', '')
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(env=env, args=['--no-sandbox'])
            pg = await b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
            logs = []
            pg.on('console', lambda m: logs.append('%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: logs.append('PAGEERROR: %s' % e))
            pg.on('response', lambda r: logs.append('HTTP %s: %s' % (r.status, r.url)) if r.status >= 400 else None)
            await pg.goto('http://127.0.0.1:%d/index.html?v=36&b=35' % PORT, wait_until='networkidle')
            await pg.wait_for_timeout(1200)
            # 스프라이트 로드 확인
            print('pixel ready', await pg.evaluate('DS.PIXEL.ready()'))
            print('cell', await pg.evaluate('[DS.PIXEL.CELL_W, DS.PIXEL.CELL_H, DS.PIXEL.CX, DS.PIXEL.FEET, DS.PIXEL.SPR_H]'))
            await pg.evaluate("DS.game.act('kickoff')")
            await pg.wait_for_timeout(3200)
            await pg.evaluate('DS.Match.setSpeed(2)')
            print('start', await pg.evaluate("JSON.stringify({clock:DS.Match.clock,phase:DS.Match.phase})"))

            # 선수 화면 높이 측정 (pxH = SPR_H*PLAYER_K*gs*1.24, scaleFor 1.02배)
            info = await pg.evaluate("""(() => {
              const pr = DS.Match.probe();
              const all = pr.home.concat(pr.away);
              const PX = DS.PIXEL;
              const rows = all.slice(0, 6).map(r => ({name: r.name, pose: r.pose, gait: r.gait,
                gv: r.gaitV, ch: r.ch, sc: r.screen.scale,
                pxH: Math.round(pr.view.sprH * 0.84 * r.screen.scale * 1.24 * 1.02)}));
              return JSON.stringify({sprH: pr.view.sprH, w: pr.view.w, h: pr.view.h, rows: rows});
            })()""")
            print('probe', info[:600])

            # 걸음 위상에 따른 프레임 열 추이
            frames = await pg.evaluate("""(async () => {
              const out = [];
              for (let i = 0; i < 24; i++) {
                const pr = DS.Match.probe();
                const all = pr.home.concat(pr.away);
                const p = all.find(q => q.moving && q.pose === 'run') || all[0];
                out.push({g: p.gait, gv: p.gaitV, pose: p.pose});
                await new Promise(r => setTimeout(r, 40));
              }
              return JSON.stringify(out);
            })()""")
            print('gait samples', frames[:400])

            await pg.screenshot(path=os.path.join(OUT, 'v36b-01-play.png'))
            await pg.screenshot(path=os.path.join(OUT, 'v36b-02-closeup.png'),
                               clip={'x': 150, 'y': 100, 'width': 340, 'height': 190})

            # 4프레임 사이클 캡처 — 한 선수를 클로즈업으로 연속 촬영
            shots = []
            for i in range(8):
                shots.append(await pg.screenshot(clip={'x': 150, 'y': 90, 'width': 300, 'height': 180}))
                await pg.wait_for_timeout(90)
            for i, s in enumerate(shots):
                open(os.path.join(OUT, 'run-%d.png' % i), 'wb').write(s)

            # fps
            fps = await pg.evaluate("""(async () => {
              let n = 0, t0 = performance.now();
              await new Promise(res => { function tick(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
              return Math.round(n / ((performance.now()-t0)/1000) * 10) / 10;
            })()""")
            print('fps', fps)
            print('errs', await pg.evaluate('JSON.stringify(window.__DS_ERRS)'))
            print('logs', logs[:12])
            await b.close()
    finally:
        srv.kill()

asyncio.run(main())
