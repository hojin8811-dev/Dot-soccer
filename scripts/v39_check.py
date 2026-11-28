#!/usr/bin/env python3
"""v39 경기 검증 — 90분 완주(844×390) · 교체 인/아웃 연출 · 오픈 찬스 슈팅 · 신규 카드 발동 · 회전 안내.
사용: python3 scripts/v39_check.py [출력폴더]
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ.get('LD_LIBRARY_PATH') if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8166'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b=39'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/dot-soccer-v18/preview/v39'
os.makedirs(OUT, exist_ok=True)

res = {}
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs, console = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.on('console', lambda m: console.append(m.text[:160]) if m.type == 'error' else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)
        pg.evaluate("""() => {
          const S = DS.game.state();
          S.tut = { done: true, step: 0, runs: 1 };
          /* 신규 카드가 손패에 들어오도록 덱을 새 카드 위주로 */
          S.deck = ['false9', 'invert', 'counter', 'target', 'parkbus', 'jokersub'];
          S.condition = 88; S.morale = 70;
          DS.game.save(); DS.game.renderAll();
        }""")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2600)
        res['start'] = pg.evaluate("""() => ({
          running: DS.Match.running, phase: DS.Match.phase,
          counts: DS.Match.v38().counts.n,
          tokens: DS.Match.probe ? DS.Match.probe().art : null
        })""")

        # ── 교체 연출: 15분 진행 후 교체 1회
        pg.evaluate("""() => { DS.Match.setSpeed && DS.Match.setSpeed(3); }""")
        pg.wait_for_timeout(6000)
        sub = pg.evaluate("""() => {
          const st = DS.Match.subState();
          const outP = st.onPitch[9] || st.onPitch[1];
          const inB = st.bench.find(x => !x.used) || st.bench[0];
          const ok = DS.Match.substitute(inB.id, outP.id);
          const banner = document.getElementById('m-banner');
          const cut = document.querySelector('#m-cutin .cutin');
          return { ok: ok, out: outP.name, inn: inB.name, minute: st.minute,
                   banner: banner ? banner.innerText.replace(/\\n/g, ' | ') : null,
                   bannerCls: banner ? banner.className : null,
                   cutin: cut ? cut.innerText.replace(/\\n/g, ' | ') : null,
                   cutinCls: document.getElementById('m-cutin') ? document.getElementById('m-cutin').className : null,
                   log: DS.Match.subState().subs };
        }""")
        res['sub'] = sub
        pg.wait_for_timeout(250)
        pg.screenshot(path=f'{OUT}/v39-sub-cutin-844x390.png')

        # ── 신규 카드 발동 + 피치 오버레이
        card = pg.evaluate("""() => {
          const out = [];
          ['false9', 'invert', 'counter', 'target', 'parkbus', 'jokersub'].forEach(k => {
            const ok = DS.Match.qaCard(k);
            out.push({ key: k, ok: ok });
          });
          return out;
        }""")
        pg.wait_for_timeout(2600)
        res['cards'] = card
        res['hud'] = pg.evaluate("""() => {
          const v = DS.Match.v39();
          const chips = document.querySelectorAll('#m-buffs *, .buff-chip, .m-buff');
          return { activeBuffs: v.activeBuffs, overlays: v.overlays, cards: v.cards, chips: chips.length };
        }""")
        pg.screenshot(path=f'{OUT}/v39-card-overlay-844x390.png')
        res['v39'] = pg.evaluate("() => DS.Match.v39()")
        res['overlays'] = pg.evaluate("() => DS.Match.v39().overlays")

        # ── 90분 완주 (동기 시뮬) + fps 측정
        res['full'] = pg.evaluate("""() => {
          const fps = [];
          return new Promise(resolve => {
            let n = 0, t0 = performance.now();
            function tick() {
              n++;
              if (n < 90) { requestAnimationFrame(tick); return; }
              const dt = (performance.now() - t0) / 1000;
              const r = DS.Match.qaSim();
              resolve({ fps: Math.round(n / dt * 10) / 10, res: r,
                        phase: DS.Match.phase, clock: DS.Match.clock, running: DS.Match.running });
            }
            requestAnimationFrame(tick);
          });
        }""")
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'{OUT}/v39-result-844x390.png')

        res['errs'] = errs[:6]
        res['console'] = console[:8]

        # ── 세로 회전 안내
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.wait_for_timeout(700)
        res['rotate'] = pg.evaluate("""() => {
          const el = document.getElementById('rotate');
          const cs = el ? getComputedStyle(el) : null;
          return { display: cs ? cs.display : null, opacity: cs ? cs.opacity : null, text: el ? el.innerText.slice(0, 60) : null };
        }""")
        pg.screenshot(path=f'{OUT}/v39-rotate-390x844.png')
        b.close()
finally:
    srv.terminate()

print(json.dumps(res, ensure_ascii=False, indent=1))
