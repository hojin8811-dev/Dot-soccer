#!/usr/bin/env python3
"""v38b 마이팀 전술판 레이아웃 계측 + 스크린샷 (844×390 · 915×412 · 세로 390×844)."""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8154
B = os.environ.get('BUILD', '38')
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b={B}'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/v38b-qa'
TAG = sys.argv[2] if len(sys.argv) > 2 else 'squad'
os.makedirs(OUT, exist_ok=True)

MEASURE = r"""
() => {
  const g = s => document.querySelector(s);
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const sq = g('.sq'), pitch = g('.sq-pitch'), right = g('.sq-right'), left = g('.sq-left');
  const bench = g('.sq-bench'), mode = g('.sq-mode'), syn = g('.sq-syn'), main = g('main'), box = g('#screen-squad');
  const vh = window.innerHeight, vw = window.innerWidth;
  const out = {
    vp: [vw, vh], main: r(main), screen: r(box), sq: r(sq), left: r(left), pitch: r(pitch),
    bench: r(bench), mode: r(mode), right: r(right), syn: r(syn),
    scroll: { main: main ? main.scrollHeight - main.clientHeight : null, right: right ? right.scrollHeight - right.clientHeight : null },
    pitchInView: pitch ? (pitch.getBoundingClientRect().bottom <= vh + 0.5) : null,
    benchInView: bench ? (bench.getBoundingClientRect().bottom <= vh + 0.5) : null,
    syn: syn ? { h: r(syn).h, display: getComputedStyle(syn).display, wrap: getComputedStyle(syn).flexWrap } : null,
    synRows: [...document.querySelectorAll('.sq-syn .row')].map(e => r(e)),
    synFx: (() => { const e = g('.sq-syn .syn-fx'); return e ? r(e) : null; })(),
    tokenCount: document.querySelectorAll('.sq-pitch .tok').length,
    rotate: (() => { const e = g('#rotate'); if (!e) return null; const cs = getComputedStyle(e); return { display: cs.display, opacity: cs.opacity }; })()
  };
  return out;
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
res = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        for (w, h) in [(844, 390), (915, 412), (390, 844)]:
            pg = b.new_page(viewport={'width': w, 'height': h})
            pg.goto(URL, wait_until='load')
            pg.evaluate("localStorage.clear()")
            pg.goto(URL, wait_until='load')
            pg.wait_for_timeout(1100)
            pg.evaluate("() => { const S=DS.game.state(); S.morale=74; S.form=['L','L','L','W','W']; DS.game.save(); DS.game.renderAll(); }")
            key = f'{w}x{h}'
            if w > h:
                pg.click('[data-tab="squad"]')
                pg.wait_for_timeout(700)
            else:
                pg.wait_for_timeout(400)
            res[key] = pg.evaluate(MEASURE)
            pg.screenshot(path=os.path.join(OUT, f'{TAG}-{key}.png'))
            pg.close()
        b.close()
finally:
    srv.terminate()
print(json.dumps(res, ensure_ascii=False, indent=1))
