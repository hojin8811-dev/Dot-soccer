#!/usr/bin/env python3
"""v38 라이브 검증 — https://hojin8811-dev.github.io/Dot-soccer/?v=38&b=37
배포 반영을 폴링한 뒤 라이브에서 코치마크·90분 완주·fps·오류·초상화·상세창을 확인한다.
사용: python3 scripts/v38_live.py [출력폴더]
"""
import json, os, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
BASE = 'https://hojin8811-dev.github.io/Dot-soccer/'
URL = BASE + '?v=38&b=37'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v38')
res = {'ok': True, 'url': URL}


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, locale='ko-KR')
        pg = ctx.new_page()
        errs, console, bad = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: console.append(m.text[:160]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg.on('response', lambda r: bad.append((r.status, r.url)) if r.status >= 400 and '/icons/' not in r.url else None)

        # 배포 반영 폴링 (최대 5분)
        t0 = time.time()
        deployed = False
        while time.time() - t0 < 300:
            v = pg.evaluate("""async () => { try { const r = await fetch('index.html?ts=' + Date.now(), {cache:'no-store'});
                const t = await r.text(); return t.indexOf('v=38&b=37') >= 0 ? 'v38' : 'old'; } catch(e){ return 'err'; } }""")
            if v == 'v38':
                deployed = True
                break
            time.sleep(10)
            pg.goto(URL, wait_until='load')
        res['deployed'] = deployed
        res['wait_s'] = round(time.time() - t0, 1)

        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)
        res['assets'] = pg.evaluate("""async () => {
            const urls = ['js/match.js?v=38&b=37', 'js/game.js?v=38&b=37', 'js/data.js?v=38&b=37',
                          'css/style.css?v=38&b=37', 'assets/portraits/p01.png', 'assets/portraits/p250.png',
                          'assets/portraits/head/p500.png'];
            const out = {};
            for (const u of urls) { try { const r = await fetch(u, {cache:'force-cache'}); out[u] = r.status; } catch (e) { out[u] = 'err'; } }
            return out;
        }""")
        res['title'] = pg.title()
        # 새 게임 → 첫 공식전 코치마크
        pg.evaluate("() => { const S = DS.game.state(); S.condition = 100; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2800)
        res['tut_open'] = pg.evaluate("!!document.querySelector('#m-overlay .tut')")
        res['tut_paused'] = pg.evaluate("DS.Match.paused")
        pg.screenshot(path=os.path.join(OUT, 'v38-live-tutorial.png'))
        pg.click('[data-act="tutnext"]'); pg.wait_for_timeout(300)
        pg.click('[data-act="tutnext"]'); pg.wait_for_timeout(300)
        pg.click('[data-act="tutnext"]'); pg.wait_for_timeout(300)
        pg.click('[data-act="tutnext"]'); pg.wait_for_timeout(700)
        res['tut_done'] = pg.evaluate("DS.game.state().tut")
        fps = pg.evaluate("""async () => { let n=0; const t0=performance.now();
            await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
            return Math.round(n/((performance.now()-t0)/1000)*10)/10; }""")
        res['fps'] = fps
        pg.screenshot(path=os.path.join(OUT, 'v38-live-match.png'))
        # 90분 완주
        pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
        t1 = time.time()
        while time.time() - t1 < 200:
            st = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, running:p.running, paused:p.paused, half:p.halftime}; })()")
            if st['paused'] and st['half']:
                if pg.locator('[data-act="advstart"]').count():
                    pg.click('[data-act="advstart"]')
                elif pg.locator('[data-act="halftime2"]').count():
                    pg.click('[data-act="halftime2"]')
                pg.wait_for_timeout(400)
                continue
            if not st['running']:
                break
            pg.wait_for_timeout(1500)
        res['turbo_s'] = round(time.time() - t1, 1)
        pr = pg.evaluate("DS.Match.probe()")
        res['final'] = {'clock': pr['clock'], 'matchPhase': pg.evaluate("DS.Match.phase"), 'running': pr['running'],
                        'portraitsReady': pr['view']['portraitsReady'], 'portraitsTotal': pr['view']['portraitsTotal']}
        res['v38'] = pg.evaluate("DS.Match.v38()")
        res['v35'] = pg.evaluate("DS.Match.v35 ? DS.Match.v35() : null")
        res['score'] = pg.evaluate("({home: DS.Match.homeScore, away: DS.Match.awayScore})")
        pg.wait_for_timeout(1800)
        pg.screenshot(path=os.path.join(OUT, 'v38-live-result.png'))

        # 라이브 상세창 + 이적시장 비교
        pg2 = ctx.new_page()
        pg2.on('pageerror', lambda e: errs.append('p2:' + str(e)[:160]))
        pg2.on('console', lambda m: console.append(m.text[:160]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg2.goto(URL, wait_until='load')
        pg2.wait_for_timeout(1600)
        pg2.click('.tabbar button[data-tab="club"]')
        pg2.wait_for_timeout(700)
        pg2.click('#screen-club .rs-row[data-act="player"]')
        pg2.wait_for_timeout(500)
        res['live_detail'] = pg2.evaluate("(() => { const m=document.getElementById('modal'); const im=m.querySelector('.pd-art img'); return {pot:!!m.querySelector('.potg'), imgW: im?im.naturalWidth:0, cmp:!!m.querySelector('.cmp-card'), text:(m.textContent||'').slice(0,60)}; })()")
        pg2.screenshot(path=os.path.join(OUT, 'v38-live-detail.png'))
        pg2.click('#modal .x'); pg2.wait_for_timeout(300)
        pg2.click('.tabbar button[data-tab="shop"]')
        pg2.wait_for_timeout(900)
        pg2.click('.mkt.pclick')
        pg2.wait_for_timeout(600)
        res['live_market_cmp'] = pg2.evaluate("(() => { const m=document.getElementById('modal'); const im=m.querySelector('.pd-art img'); return {pot:!!m.querySelector('.potg'), imgW: im?im.naturalWidth:0, cmp:!!m.querySelector('.cmp-card'), rows:m.querySelectorAll('.cmp-row').length}; })()")
        pg2.screenshot(path=os.path.join(OUT, 'v38-live-market.png'))

        res['ds_errs'] = pg.evaluate("window.__DS_ERRS")
        res['pageerrors'] = errs
        res['console_errors'] = console
        res['http_bad'] = bad
        res['ok'] = (deployed and res['ds_errs'] == [] and not errs and not console and not bad
                     and res['final']['running'] is False and res['final']['portraitsReady'] == res['final']['portraitsTotal']
                     and res['live_detail']['pot'] and res['live_detail']['imgW'] > 0 and res['live_market_cmp']['cmp'])
        b.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0 if res['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
