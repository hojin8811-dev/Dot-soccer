#!/usr/bin/env python3
"""v38 진단 — 라커룸 카운트·초상화 수·하프타임 흐름을 구간별로 본다."""
import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8141
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=37'

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
        pg.wait_for_timeout(1100)
        pg.evaluate("() => { const S=DS.game.state(); S.condition=100; S.tut={done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2500)
        out['start'] = pg.evaluate("(() => { const p=DS.Match.probe(); const v=DS.Match.v38(); return {clock:p.clock, pr:p.view.portraitsReady, pt:p.view.portraitsTotal, press:v.press, lineY:v.lineY, counts:v.counts}; })()")
        out['start']['render'] = out['start']['counts'].pop('locks')
        pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
        for i in range(8):
            pg.wait_for_timeout(5000)
            st = pg.evaluate("(() => { const p=DS.Match.probe(); const v=DS.Match.v38(); return {clock:p.clock, phase:p.phase, paused:p.paused, half:p.halftime, pr:p.view.portraitsReady, pt:p.view.portraitsTotal, press:v.press, lineY:v.lineY, recounts:v.counts.recounts, n:v.counts.n}; })()")
            out[f't{i}'] = st
            if st['paused']:
                # 하프타임 오버레이: 어떤 버튼이 있는지 남기고 후반 시작
                out['overlay'] = pg.evaluate("Array.from(document.querySelectorAll('#m-overlay [data-act]')).map(e=>e.getAttribute('data-act'))")
                try:
                    pg.click('[data-act="halftime2"]', timeout=2000)
                except Exception as e:
                    out['halfclick'] = str(e)[:120]
                    pg.evaluate("DS.game.act('halftime2', document.querySelector('#m-overlay .btn')||document.body)")
                pg.wait_for_timeout(600)
            if st['phase'] == 'ended':
                break
        out['end'] = pg.evaluate("(() => { const p=DS.Match.probe(); const v=DS.Match.v38(); return {clock:p.clock, phase:p.phase, pr:p.view.portraitsReady, pt:p.view.portraitsTotal, press:v.press, lineY:v.lineY, recounts:v.counts.recounts, n:v.counts.n, score:[DS.Match.homeScore, DS.Match.awayScore]}; })()")
        out['errs'] = errs
        b.close()
finally:
    srv.terminate()
print(json.dumps(out, ensure_ascii=False, indent=1))
