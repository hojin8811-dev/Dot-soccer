#!/usr/bin/env python3
"""v39 스모크 — 페이지 오류 · 전술카드 18종/일러스트 · 잠재 구간 · 교체 연출 · 상세창 OVR 게이지."""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8165'))
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
        pg.on('console', lambda m: console.append(m.text[:200]) if m.type == 'error' else None)
        bad = []
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)

        res['cards'] = pg.evaluate("""() => ({
          n: DS.CARDS.length,
          keys: DS.CARDS.map(c => c.key),
          fx: DS.CARDS.map(c => c.fx),
          art: DS.CARDS.map(c => (DS.tacticArt(c.key) || '').length),
          ranges: DS.POT_RANGE
        })""")

        # 팟 구간: 등급별로 새로 만든 선수의 잠재가 구간 안에 있는지
        res['pot'] = pg.evaluate("""() => {
          const out = {};
          ['dong', 'eun', 'geum', 'legend'].forEach(r => {
            const list = [];
            for (let i = 0; i < 40; i++) {
              const p = DS.makePlayer({ rarity: r, age: 20 + (i % 12) });
              DS.fitPot(p, DS.ratingOf(p) + (i % 3 === 0 ? 6 : 10));
              list.push(p.pot);
            }
            out[r] = { min: Math.min(...list), max: Math.max(...list), sample: list.slice(0, 6) };
          });
          /* 은 등급 영입 시나리오: OVR 62 은 선수 (예전엔 잠재 68) */
          const p2 = DS.makePlayer({ rarity: 'eun', s: 5, t: 5, p: 5 });
          DS.fitPot(p2, DS.ratingOf(p2) + 6);
          out.silver62 = { ovr: DS.ratingOf(p2), pot: p2.pot };
          return out;
        }""")

        # 잠재 상한 표시: raw > pot 인 옛 세이브 선수
        res['gauge'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const p = S.squad[9];
          p.pot = DS.ratingOf(p) - 6;      // 옛 세이브처럼 상한이 OVR보다 낮은 상태
          p.s = Math.min(10, p.s + 3);
          p.stats = DS.statSheet(p);
          DS.game.save(); DS.game.renderAll();
          const g = DS.potPct(p);
          DS.game.playerModal(p);
          const el = document.querySelector('.potg');
          return { name: p.name, ovr: DS.ratingOf(p), raw: g.raw, pot: g.pot, applied: g.applied,
                   cls: el ? el.className : null, text: el ? el.innerText.replace(/\\n/g, ' | ') : null };
        }""")
        pg.screenshot(path=f'{OUT}/v39-potgauge-844x390.png')

        # 덱 모달 18종
        res['deck'] = pg.evaluate("""() => {
          DS.game.closeModal ? DS.game.closeModal() : null;
          document.getElementById('m-overlay') && document.getElementById('m-overlay').classList.remove('on');
          DS.game.setTab('squad');
          const btn = document.querySelector('[data-act="deck"]');
          if (btn) { btn.click(); }
          const rows = document.querySelectorAll('.deckrow');
          return { rows: rows.length,
                   sheet: (document.querySelector('.sheet') || document.body).innerText.slice(0, 60),
                   newOnes: ['false9','invert','counter','target','parkbus','jokersub'].map(k => !!document.querySelector('.deckrow[data-k="' + k + '"]')) };
        }""")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/v39-deck-844x390.png')

        b.close()
finally:
    srv.terminate()

res['errs'] = errs[:6]
res['console'] = console[:6]
res['bad'] = bad[:8]
print(json.dumps(res, ensure_ascii=False, indent=1))
