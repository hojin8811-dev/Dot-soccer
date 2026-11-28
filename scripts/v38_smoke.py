#!/usr/bin/env python3
"""v38 스모크 — 로컬 서버 + Playwright Chromium 844x390.
1) 새 게임 로드 → 콘솔/페이지 오류 0
2) 마이팀: 커스텀 전술 지시·팀 분위기 카드 존재, 조작 → 세이브 반영
3) 선수 상세창(마이팀 토큰 / 이적시장 비교카드) 열림·잠재 게이지·초상화 200
4) 클럽/유소년 상세 진입
사용: python3 scripts/v38_smoke.py [출력폴더]
"""
import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8138
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v38')


def serve():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    return p


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = serve()
    errs, console = [], []
    res = {'ok': True}
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
            pg = b.new_page(viewport={'width': 844, 'height': 390})
            pg.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            bad = []
            pg.on('response', lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
            pg.goto(f'http://127.0.0.1:{PORT}/index.html?v=38&b=37', wait_until='load')
            pg.evaluate("localStorage.clear()")
            pg.goto(f'http://127.0.0.1:{PORT}/index.html?v=38&b=37', wait_until='load')
            pg.wait_for_timeout(1200)
            res['game_loaded'] = pg.evaluate("!!(window.DS && DS.Match)")
            res['tabs'] = pg.evaluate("document.querySelectorAll('.tabbar button').length")

            # 마이팀
            pg.click('.tabbar button[data-tab="squad"]')
            pg.wait_for_timeout(500)
            res['ctac_card'] = pg.evaluate("!!document.querySelector('.ctac-seg')")
            res['mood_card'] = pg.evaluate("!!document.querySelector('.mood .md-label')")
            res['ctac_before'] = pg.evaluate("JSON.parse(localStorage.getItem('dot-soccer-v3-save')||'{}').ctac")
            pg.click('.ctac-seg[data-ctac="line"] button[data-v="75"]')
            pg.wait_for_timeout(300)
            res['ctac_after'] = pg.evaluate("JSON.parse(localStorage.getItem('dot-soccer-v3-save')||'{}').ctac")
            pg.click('.ctac-seg[data-ctac="press"] button[data-v="75"]')
            pg.click('.ctac-seg[data-ctac="wide"] button[data-v="25"]')
            pg.wait_for_timeout(300)
            res['ctac_after2'] = pg.evaluate("JSON.parse(localStorage.getItem('dot-soccer-v3-save')||'{}').ctac")
            pg.screenshot(path=os.path.join(OUT, 'v38-squad-ctac-844x390.png'))

            # 벤치 ⓘ → 상세
            pg.click('.sq-bench .pinfo')
            pg.wait_for_timeout(500)
            res['bench_detail_open'] = pg.evaluate("!!document.querySelector('#modal .potg')")
            res['detail_text'] = pg.evaluate("(document.querySelector('#modal .sheet')||{}).innerText ? document.querySelector('#modal .sheet').innerText.slice(0,400) : ''")
            imgs = pg.evaluate("Array.from(document.querySelectorAll('#modal img')).map(i=>({src:i.getAttribute('src'), w:i.naturalWidth}))")
            res['detail_imgs'] = imgs
            pg.screenshot(path=os.path.join(OUT, 'v38-player-detail-844x390.png'))
            pg.click('#modal .x')
            pg.wait_for_timeout(250)

            # 피치 토큰 → 상세
            pg.click('#pitch-squad .tok')
            pg.wait_for_timeout(400)
            res['token_detail_open'] = pg.evaluate("!!document.querySelector('#modal .potg')")
            pg.click('#modal .x')

            # 클럽
            pg.click('.tabbar button[data-tab="club"]')
            pg.wait_for_timeout(600)
            res['club_mood'] = pg.evaluate("!!document.querySelector('#screen-club .mood')")
            pg.click('#screen-club .rs-row[data-act="player"]')
            pg.wait_for_timeout(400)
            res['club_detail_open'] = pg.evaluate("!!document.querySelector('#modal .potg')")
            res['roster_rows'] = pg.evaluate("document.querySelectorAll('#screen-club .rs-row').length")
            pg.screenshot(path=os.path.join(OUT, 'v38-club-detail-844x390.png'))
            pg.click('#modal .x')

            # 이적시장 비교 카드
            pg.click('.tabbar button[data-tab="shop"]')
            pg.wait_for_timeout(800)
            res['mkt_cards'] = pg.evaluate("document.querySelectorAll('.mkt.pclick').length")
            pg.click('.mkt.pclick')
            pg.wait_for_timeout(500)
            res['market_detail_open'] = pg.evaluate("!!document.querySelector('#modal .potg')")
            res['market_cmp'] = pg.evaluate("!!document.querySelector('#modal .cmp-card')")
            res['cmp_rows'] = pg.evaluate("document.querySelectorAll('#modal .cmp-row').length")
            pg.screenshot(path=os.path.join(OUT, 'v38-market-compare-844x390.png'))
            pg.click('#modal .x')

            res['ds_errs'] = pg.evaluate("window.__DS_ERRS")
            res['pageerrors'] = errs
            res['console_errors'] = [c for c in console if c[0] == 'error']
            res['http_bad'] = [(s, u) for (s, u) in bad if s >= 400]
            res['ok'] = (res['ds_errs'] == [] and not errs and not res['console_errors'] and not res['http_bad'])
            b.close()
    except Exception as e:
        res['ok'] = False
        res['exception'] = str(e)[:400]
        res['partial'] = {k: v for k, v in res.items()}
    finally:
        srv.terminate()
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0 if res['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
