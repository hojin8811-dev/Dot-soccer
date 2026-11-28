#!/usr/bin/env python3
"""v38b 회귀 진단 — v33(전력차·오프사이드)·v35(사이드 AI)·v38(전술·성향·폼) 계측이
수정 뒤에도 그대로 도는지 한 번에 본다. (실제 킥오프 → qaSim 90분 → 계측)"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ.get('LD_LIBRARY_PATH') if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8158
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=38'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
out = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; S.condition=95; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2500)
        out['offside'] = pg.evaluate("() => { try { return DS.Match.debugOffside ? DS.Match.debugOffside('home') : 'no hook'; } catch (e) { return String(e); } }")
        pg.evaluate("DS.Match.qaTurbo(true)")
        out['sim'] = pg.evaluate("() => DS.Match.qaSim()")
        out['v38'] = pg.evaluate("() => { const v = DS.Match.v38(); return {form: v.formFactor, formAway: v.formAway, ctac: v.ctac, counts: v.counts.n}; }")
        out['v33'] = pg.evaluate("() => { const v = DS.Match.v33(); return {gap: v.gap, ball: {kind: v.ball.kind, trail: v.ball.trail}, setpiece: v.setpiece}; }")
        out['v35'] = pg.evaluate("() => { const v = DS.Match.v35(); return {lanes: v.lanes, switchPass: v.switchPass, diagonal: v.diagonal, cross: v.cross, cutback: v.cutback, flankEntry: v.flankEntry}; }")
        out['stats'] = pg.evaluate("() => DS.Match.stats()")
        out['errs'] = errs + pg.evaluate("() => (window.__DS_ERRS||[])")
        b.close()
finally:
    srv.terminate()
print(json.dumps(out, ensure_ascii=False, indent=1))
