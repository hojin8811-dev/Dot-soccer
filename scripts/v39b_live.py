#!/usr/bin/env python3
"""v39b 라이브 검증 — https://hojin8811-dev.github.io/Dot-soccer/?v=39&b=40
상수 · 90분 완주 · 상세창 성장 블록 · 회전 안내 · 오류/HTTP 4xx · 자산 200.
사용: python3 scripts/v39b_live.py [출력폴더]
"""
import json, os, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
URL = 'https://hojin8811-dev.github.io/Dot-soccer/?v=39&b=40'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/dot-soccer-v18/preview/v39b'
os.makedirs(OUT, exist_ok=True)

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={'width': 844, 'height': 390})
    errs, console, bad, assets = [], [], [], {}
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: console.append(m.text[:160]) if m.type == 'error' else None)
    pg.on('response', lambda r: (bad.append(f'{r.status} {r.url}') if r.status >= 400 else None,
                                 assets.__setitem__(r.url.split('/')[-1][:40], r.status)))
    pg.goto(URL, wait_until='load')
    pg.evaluate("localStorage.clear()")
    pg.goto(URL, wait_until='load')
    pg.wait_for_timeout(2500)

    res['consts'] = pg.evaluate("""() => ({
      expToNext: [DS.expToNext(0), DS.expToNext(10)], LEVEL_GAIN: DS.LEVEL_GAIN,
      RESERVE_LEVEL_GAIN: DS.RESERVE_LEVEL_GAIN, TRAIN_GAIN_K: DS.TRAIN_GAIN_K,
      TRAIN_EXP_SHARE: DS.TRAIN_EXP_SHARE, RESERVE_KIND_MULT: DS.RESERVE_KIND_MULT,
      YOUTH_EXP_MULT: DS.YOUTH_EXP_MULT, YOUTH_AGE_MAX: DS.YOUTH_AGE_MAX,
      cards: DS.CARDS.length, trainExp: DS.trainExpGain({ level: 0 })
    })""")
    res['assets'] = {k: v for k, v in assets.items() if any(t in k for t in ('.js', '.css', '.html', 'sw', 'portrait'))}
    pg.evaluate("""() => { const S = DS.game.state(); S.tut = { done: true, step: 0, runs: 1 }; DS.game.save(); DS.game.renderAll(); }""")
    pg.click('#screen-home [data-act="kickoff"]')
    pg.wait_for_timeout(2400)
    res['full'] = pg.evaluate("""() => new Promise(resolve => {
      let n = 0, t0 = performance.now();
      function tick() {
        n++;
        if (n < 90) { requestAnimationFrame(tick); return; }
        const dt = (performance.now() - t0) / 1000;
        const r = DS.Match.qaSim();
        resolve({ fps: Math.round(n / dt * 10) / 10, res: r, phase: DS.Match.phase,
                  clock: DS.Match.clock, running: DS.Match.running,
                  tokens: DS.Match.probe().art });
      }
      requestAnimationFrame(tick);
    })""")
    pg.wait_for_timeout(1000)
    pg.evaluate("""() => {
          const ov = document.getElementById('m-overlay');
          if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
          const S = DS.game.state();
          if (S.lastReport) { DS.game.showReport(S.lastReport); }
          ['m-overlay', 'm-advice'].forEach(id => {
            const el = document.getElementById(id);
            if (el && id === 'm-overlay') { el.classList.remove('on'); el.innerHTML = ''; }
          });
        }""")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/v39b-live-result-844x390.png')
    res['expReport'] = pg.evaluate("""() => {
      const r = DS.game.state().lastReport;
      return (r && r.expGain ? r.expGain.slice(0, 5) : []).map(x => ({ name: x.name, exp: x.exp, lv: x.level }));
    }""")
    res['detail'] = pg.evaluate("""() => {
      const ov = document.getElementById('m-overlay'); if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
      const S = DS.game.state();
      DS.game.playerModal(S.squad[0]);
      const g = document.querySelector('#modal .growth');
      return { open: (document.getElementById('modal') || {}).className,
               growth: g ? g.innerText.replace(/\\n/g, ' | ') : null };
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/v39b-live-detail-844x390.png')
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(700)
    res['rotate'] = pg.evaluate("""() => { const el = document.getElementById('rotate');
      const cs = el ? getComputedStyle(el) : null;
      return { display: cs ? cs.display : null, opacity: cs ? cs.opacity : null }; }""")
    res['errs'] = errs[:6]
    res['console'] = console[:8]
    res['bad'] = bad[:8]
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
