#!/usr/bin/env python3
"""v39 라이브 검증 — https://hojin8811-dev.github.io/Dot-soccer/?v=39&b=39
카드 18종·덱 모달·교체 연출·90분 완주·토큰·오류·회전 안내 + 라이브 스크린샷.
사용: python3 scripts/v39_live.py [출력폴더]
"""
import json, os, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
URL = 'https://hojin8811-dev.github.io/Dot-soccer/?v=39&b=39'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/dot-soccer-v18/preview/v39'
os.makedirs(OUT, exist_ok=True)
res = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
        errs, cons, bad = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: cons.append(m.text[:160]) if m.type == 'error' else None)
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url[-70:]}') if r.status >= 400 else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1800)
        pg.evaluate("""() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1};
          S.condition=90; S.morale=70; DS.game.save(); DS.game.renderAll(); }""")

        res['build'] = pg.evaluate("""() => ({
          cards: DS.CARDS.length,
          newCards: DS.NEW_CARDS,
          potRange: DS.POT_RANGE,
          src: Array.from(document.scripts).map(s => s.src).filter(s => /match|data|game/.test(s)).map(s => s.split('?')[1])
        })""")

        # 덱 모달 (18행)
        pg.click('[data-tab="squad"]')
        pg.wait_for_timeout(900)
        pg.evaluate("""() => { const b=document.querySelector('[data-act="deck"]'); if (b) b.click(); }""")
        pg.wait_for_timeout(500)
        res['deck'] = pg.evaluate("""() => ({ rows: document.querySelectorAll('.deckrow').length,
          newTags: document.querySelectorAll('.deckrow .newtag').length,
          title: (document.querySelector('.sheet-title') || document.querySelector('.sheet') || {}).innerText ? (document.querySelector('.sheet-title') || document.querySelector('.sheet')).innerText.split('\\n')[0] : null })""")
        pg.screenshot(path=os.path.join(OUT, 'v39-live-deck.png'))
        pg.evaluate("""() => { const c=document.querySelector('[data-act="sheetclose"], .sheet-x, [data-act="close"]'); if (c) c.click(); }""")
        pg.wait_for_timeout(300)

        # 경기 시작 → 교체 연출
        pg.evaluate("""() => { const b=document.querySelector('#screen-home [data-act="kickoff"]'); if (b) b.click(); }""")
        pg.wait_for_timeout(2600)
        pg.evaluate("""() => { const b=document.querySelector('[data-act="subs"]'); if (b) b.click(); }""")
        pg.wait_for_timeout(600)
        sub = pg.evaluate("""() => {
          const st = DS.Match.subState();
          const outP = st.onPitch[9] || st.onPitch[1];
          const inB = st.bench.find(x => !x.used) || st.bench[0];
          const ok = DS.Match.substitute(inB.id, outP.id);
          const bn = document.getElementById('m-banner');
          return { ok: ok, out: outP.name, inn: inB.name,
                   banner: bn ? bn.innerText.replace(/\\n/g, ' | ') : null,
                   cutin: (document.querySelector('#m-cutin .cutin') || {}).innerText || null };
        }""")
        res['sub'] = sub
        pg.evaluate("""() => { const c=document.querySelector('[data-act="subclose"]'); if (c) c.click(); }""")
        pg.wait_for_timeout(2200)
        pg.screenshot(path=os.path.join(OUT, 'v39-live-match.png'))
        res['tokensStart'] = pg.evaluate("() => { const p = DS.Match.probe ? DS.Match.probe() : null; return p ? { ready: p.view.portraitsReady, total: p.view.portraitsTotal, n: p.players } : null; }")

        # 90분 완주 + fps
        res['full'] = pg.evaluate("""() => new Promise(resolve => {
          let n = 0, t0 = performance.now();
          function tick() {
            n++;
            if (n < 90) { requestAnimationFrame(tick); return; }
            const fps = Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10;
            const r = DS.Match.qaSim();
            const p = DS.Match.probe ? DS.Match.probe() : {};
            resolve({ fps: fps, clock: DS.Match.clock, phase: DS.Match.phase, running: DS.Match.running,
                      score: [r.home, r.away], shots: r.shots, xg: r.xg, poss: r.poss,
                      art: p.art || null, v39: DS.Match.v39() });
          }
          requestAnimationFrame(tick);
        })""")
        pg.wait_for_timeout(800)
        pg.screenshot(path=os.path.join(OUT, 'v39-live-result.png'))

        # 세로 회전
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.wait_for_timeout(700)
        res['rotate'] = pg.evaluate("""() => { const el=document.getElementById('rotate'); const cs=el?getComputedStyle(el):null;
          return { display: cs?cs.display:null, opacity: cs?cs.opacity:null }; }""")
        pg.screenshot(path=os.path.join(OUT, 'v39-live-rotate.png'))
        res['tokens'] = pg.evaluate("() => { const p = DS.Match.probe ? DS.Match.probe() : null; return p ? { ready: p.view.portraitsReady, total: p.view.portraitsTotal, n: p.players } : null; }")
        res['errs'] = errs[:5]
        res['console'] = cons[:5]
        res['bad'] = bad[:6]
        b.close()
finally:
    pass
print(json.dumps(res, ensure_ascii=False, indent=1))
