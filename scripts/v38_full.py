#!/usr/bin/env python3
"""v38 전체 검증 — 로컬 844x390 Playwright Chromium.
· 첫 공식전 코치마크(4단계·건너뛰기·재진입 없음)
· 커스텀 전술 지시가 엔진(lineY/press)에 실제로 들어가는지
· 라커룸 성향 계수·팀 분위기(formFactor) 반영
· 공식전 90분 완주(fps·오류·초상화 22/22·v35 사이드 AI)
· 390x844 회전 안내 · 옛 세이브 로드
사용: python3 scripts/v38_full.py [출력폴더] [all|844x390|rotate|oldsave]
"""
import json, os, subprocess, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8139
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=37'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'v38')
MODE = sys.argv[2] if len(sys.argv) > 2 else 'all'
res = {'ok': True, 'mode': MODE}


def serve():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    return p


def new_game(pg):
    pg.goto(URL, wait_until='load')
    pg.evaluate("localStorage.clear()")
    pg.goto(URL, wait_until='load')
    pg.wait_for_timeout(1200)


def watch(pg, errs, console, bad):
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: console.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append((r.status, r.url)) if r.status >= 400 and '/icons/' not in r.url else None)


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = serve()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
            errs, console, bad = [], [], []
            ctx = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True,
                                device_scale_factor=1, locale='ko-KR')
            pg = ctx.new_page()
            watch(pg, errs, console, bad)
            new_game(pg)
            # 사기·연패 상태를 만들어 분위기 보정을 확인 (새 게임 기본 66 · 0경기)
            pg.evaluate("""() => { const S = DS.game.state(); S.condition = 100; S.morale = 74;
                S.form = ['L','L','L','W','W']; S.money = 999999;
                S.ctac = { line: 100, press: 100, wide: 100 }; DS.game.save(); DS.game.renderAll(); }""")
            res['mood'] = pg.evaluate("(() => { const S=DS.game.state(); const m=DS.teamMood(S.morale,S.form); return {label:m.label,score:m.score,mult:m.mult,streak:m.streak}; })()")

            if MODE in ('all', '844x390'):
                # 마이팀 카드
                pg.click('.tabbar button[data-tab="squad"]')
                pg.wait_for_timeout(500)
                pg.screenshot(path=os.path.join(OUT, 'v38-squad-844x390.png'))
                # 코치마크: 첫 공식전
                pg.click('.tabbar button[data-tab="home"]')
                pg.wait_for_timeout(300)
                res['tut_before'] = pg.evaluate("DS.game.state().tut")
                pg.click('#screen-home [data-act="kickoff"]')
                pg.wait_for_timeout(2600)
                res['tut_open'] = pg.evaluate("!!document.querySelector('#m-overlay .tut')")
                res['tut_paused'] = pg.evaluate("DS.Match.paused")
                res['tut_step1_text'] = pg.evaluate("(document.querySelector('.tut-card')||{}).innerText||''")
                pg.screenshot(path=os.path.join(OUT, 'v38-tutorial-1-844x390.png'))
                pg.click('[data-act="tutnext"]')
                pg.wait_for_timeout(350)
                res['tut_step2_text'] = pg.evaluate("(document.querySelector('.tut-card')||{}).innerText||''")
                pg.screenshot(path=os.path.join(OUT, 'v38-tutorial-2-844x390.png'))
                pg.click('[data-act="tutnext"]')
                pg.wait_for_timeout(300)
                pg.click('[data-act="tutnext"]')
                pg.wait_for_timeout(300)
                res['tut_step4'] = pg.evaluate("(document.querySelector('.tut-card')||{}).innerText||''")
                pg.screenshot(path=os.path.join(OUT, 'v38-tutorial-4-844x390.png'))
                pg.click('[data-act="tutnext"]')
                pg.wait_for_timeout(600)
                res['tut_done'] = pg.evaluate("DS.game.state().tut")
                res['tut_closed'] = pg.evaluate("!document.querySelector('#m-overlay .tut')")
                res['tut_resumed'] = pg.evaluate("DS.Match.paused === false")

                # 커스텀 전술이 엔진에 반영되는지 (같은 경기에서 즉시 변경)
                pg.evaluate("DS.Match.setCustomTactics({line:100,press:100,wide:100})")
                pg.wait_for_timeout(200)
                hi = pg.evaluate("DS.Match.v38()")
                pg.evaluate("DS.Match.setCustomTactics({line:0,press:0,wide:0})")
                pg.wait_for_timeout(200)
                lo = pg.evaluate("DS.Match.v38()")
                res['ctac_engine'] = {'hi': hi, 'lo': lo,
                                      'line_changed': abs(hi['ctac']['lineOffset'] - lo['ctac']['lineOffset']) > 1,
                                      'press_changed': abs(hi['press']['home'] - lo['press']['home']) > 1,
                                      'lineY_changed': abs(hi['lineY']['home'] - lo['lineY']['home']) > 1}
                pg.evaluate("DS.Match.setCustomTactics({line:50,press:50,wide:50})")
                pg.wait_for_timeout(200)
                # v33 보호: 오프사이드 간접 프리킥 재현
                try:
                    off = pg.evaluate("DS.Match.debugOffside('home')")
                    res['offside'] = {'sp_type': (off or {}).get('setpiece', {}).get('type'),
                                      'min_d': min([d['d'] for d in (off or {}).get('atkDists', [])]) if (off or {}).get('atkDists') else None,
                                      'offender': (off or {}).get('offender')}
                except Exception as e:
                    res['offside'] = 'error: ' + str(e)[:120]

                # fps 측정 (실시간 8초)
                fps = pg.evaluate("""async () => { let n=0; const t0=performance.now();
                    await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
                    return Math.round(n / ((performance.now()-t0)/1000) * 10)/10; }""")
                res['fps'] = fps
                pg.screenshot(path=os.path.join(OUT, 'v38-match-844x390.png'))

                # 90분 완주 (그리기 생략 터보)
                pg.evaluate("DS.Match.qaTurbo(true); DS.Match.setSpeed(3)")
                t0 = time.time()
                last = None
                while time.time() - t0 < 240:
                    st = pg.evaluate("(() => { const p=DS.Match.probe(); return {clock:p.clock, phase:p.phase, mphase:DS.Match.phase, running:p.running, paused:p.paused, half:p.halftime}; })()")
                    last = st
                    if st['paused'] and st['half']:
                        # 하프타임: 수석코치 추천서(advstart=후반 시작) 또는 교체창(halftime2)
                        if pg.locator('[data-act="advstart"]').count():
                            pg.click('[data-act="advstart"]')
                        elif pg.locator('[data-act="halftime2"]').count():
                            pg.click('[data-act="halftime2"]')
                        pg.wait_for_timeout(400)
                        continue
                    if (not st['running']) or st.get('mphase') == 'ended':
                        break
                    pg.wait_for_timeout(1500)
                res['turbo_seconds'] = round(time.time() - t0, 1)
                pr = pg.evaluate("DS.Match.probe()")
                res['final'] = {'clock': pr['clock'], 'playPhase': pr['phase'], 'matchPhase': pg.evaluate("DS.Match.phase"),
                                'running': pr['running'], 'paused': pr['paused'],
                                'portraitsReady': pr['view']['portraitsReady'], 'portraitsTotal': pr['view']['portraitsTotal']}
                res['v35'] = pg.evaluate("DS.Match.v35 ? DS.Match.v35() : null")
                res['v38_probe'] = pg.evaluate("DS.Match.v38()")
                res['score'] = pg.evaluate("(() => ({home: DS.Match.homeScore, away: DS.Match.awayScore}))()")
                pg.wait_for_timeout(1800)
                res['report_shown'] = pg.evaluate("!!(document.querySelector('#modal') && document.querySelector('#modal').className.indexOf('on') >= 0 && document.querySelector('#modal').textContent.indexOf('RESULT') >= 0)")
                res['last_result'] = pg.evaluate("DS.game.state().lastResult")
                pg.screenshot(path=os.path.join(OUT, 'v38-result-844x390.png'))
                # 두 번째 공식전: 코치마크가 반복되지 않아야 한다
                try:
                    pg.click('[data-act="closemodal"]')
                except Exception:
                    pass
                pg.wait_for_timeout(600)
                pg.evaluate("() => { const S=DS.game.state(); S.condition=100; DS.game.save(); }")
                try:
                    pg.click('#screen-home [data-act="kickoff"]', timeout=4000)
                    pg.wait_for_timeout(2600)
                    res['tut_second_match'] = pg.evaluate("({open: !!document.querySelector('#m-overlay .tut'), running: DS.Match.running, paused: DS.Match.paused})")
                    pg.evaluate("DS.Match.quit ? DS.Match.quit() : null")
                except Exception as e:
                    res['tut_second_match'] = 'skip: ' + str(e)[:100]

            if MODE in ('all', 'rotate'):
                pg2 = ctx.new_page()
                watch(pg2, errs, console, bad)
                pg2.set_viewport_size({'width': 390, 'height': 844})
                pg2.goto(URL, wait_until='load')
                pg2.wait_for_timeout(1200)
                res['rotate'] = pg2.evaluate("(() => { const r=document.getElementById('rotate'); const s=getComputedStyle(r); return {display:s.display, opacity:s.opacity}; })()")
                pg2.screenshot(path=os.path.join(OUT, 'v38-rotate-390x844.png'))
                pg2.close()

            if MODE in ('all', 'oldsave'):
                # 옛 세이브(v37) 로드: v38 필드가 없어도 기본값 보정.
                # 새 컨텍스트의 init script 로 앱 부팅 전에 v37 형태 세이브를 심는다
                # (같은 페이지에서 고치면 beforeunload 저장이 덮어쓴다).
                raw = pg.evaluate("localStorage.getItem('dot-soccer-v3-save')")
                old = json.loads(raw)
                for k in ('ctac', 'tut', 'form'):
                    old.pop(k, None)
                old['totals']['matches'] = 7
                old['round'] = 7
                for q in old.get('squad', []):
                    q.pop('dev', None); q.pop('expTotal', None)
                ctx2 = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, locale='ko-KR')
                ctx2.add_init_script("try{localStorage.setItem('dot-soccer-v3-save', %s);}catch(e){}" % json.dumps(json.dumps(old, ensure_ascii=False)))
                pg3 = ctx2.new_page()
                watch(pg3, errs, console, bad)
                pg3.goto(URL, wait_until='load')
                pg3.wait_for_timeout(1600)
                res['oldsave'] = pg3.evaluate("""() => { const S = DS.game.state();
                    return {ctac:S.ctac, tut:S.tut, formLen:(S.form||[]).length,
                            dev:(S.squad[0]||{}).dev, expTotal:(S.squad[0]||{}).expTotal,
                            matches:S.totals.matches, round:S.round}; }""")
                pg3.screenshot(path=os.path.join(OUT, 'v38-oldsave-844x390.png'))
                pg3.close()

            res['ds_errs'] = pg.evaluate("window.__DS_ERRS")
            res['pageerrors'] = errs
            res['console_errors'] = [c for c in console if 'Failed to load resource' not in c]
            res['http_bad'] = bad
            res['ok'] = bool(res.get('ok')) and res['ds_errs'] == [] and not errs and not res['console_errors'] and not bad
            b.close()
    except Exception as e:
        res['ok'] = False
        res['exception'] = str(e)[:800]
    finally:
        srv.terminate()
    print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
    return 0 if res.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
