#!/usr/bin/env python3
"""v39b 검증 — 성장 상수 · 실제 세이브 유소년의 시즌별 성장(6시즌) · 경기 EXP 리포트 · 상세창 · 90분 완주.

사용: python3 scripts/v39b_check.py [출력폴더]
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8167'))
B = os.environ.get('BUILD', '40')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/dot-soccer-v18/preview/v39b'
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
        bad = []
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)

        # ① 성장 상수
        res['consts'] = pg.evaluate("""() => ({
          expToNext: [DS.expToNext(0), DS.expToNext(5), DS.expToNext(10), DS.expToNext(20)],
          LEVEL_GAIN: DS.LEVEL_GAIN, RESERVE_LEVEL_GAIN: DS.RESERVE_LEVEL_GAIN,
          TRAIN_GAIN_K: DS.TRAIN_GAIN_K, TRAIN_EXP_SHARE: DS.TRAIN_EXP_SHARE,
          RESERVE_KIND_MULT: DS.RESERVE_KIND_MULT, YOUTH_EXP_MULT: DS.YOUTH_EXP_MULT,
          YOUTH_AGE_MAX: DS.YOUTH_AGE_MAX,
          trainExpAt0: DS.trainExpGain({ level: 0 })
        })""")

        # ② 새 세이브 유소년 3명 (나이·OVR·잠재) — 2군 등록
        res['youth'] = pg.evaluate("""() => {
          const S = DS.game.state();
          DS.game.ensureYouth();
          const list = DS.game.youthList();
          list.forEach(p => DS.game.youthReserve(p.id, true));
          return {
            n: list.length,
            reg: DS.game.reserveList().length,
            rows: list.map(p => ({ id: p.id, name: p.name, pos: p.pos, age: p.age,
              rarity: p.rarity, ovr: DS.ratingOf(p), pot: p.pot, done: p._done }))
          };
        }""")

        # ③ 6시즌 아카데미 성장 (실제 흐름: 라운드마다 2군 경기 → 시즌 전환 나이 +1)
        res['seasons'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const list = DS.game.youthList();
          const ids = list.map(p => p.id);
          ids.forEach(id => { if (DS.game.reserveList().every(q => q.id !== id)) { DS.game.youthReserve(id); } });
          const name = {};
          list.forEach(p => { name[p.id] = p.name + ' (' + p.pos + ')'; });
          const pot = {};
          list.forEach(p => { pot[p.id] = p.pot; });
          const start = {};
          list.forEach(p => { start[p.id] = { ovr: DS.ratingOf(p), age: p.age }; });
          const track = {};
          ids.forEach(id => { track[id] = []; });
          const capS = {};
          for (let s = 1; s <= 6; s++) {
            for (let r = 0; r < 38; r++) {
              if (S.seasonOver) { break; }
              DS.game.simRound();
            }
            ids.forEach(id => {
              const p = (S.youth && S.youth.intake || []).find(x => x.id === id);
              if (!p) { return; }
              track[id].push({ s: s, age: p.age, ovr: DS.ratingOf(p), lv: p.level, dev: Math.round((p.dev || 0) * 10) / 10 });
              if (!capS[id] && DS.rawRating(p) >= DS.potOf(p)) { capS[id] = s; }
            });
            DS.game.newSeason();
          }
          return ids.map(id => ({ name: name[id], pot: pot[id], start: start[id], capSeason: capS[id] || null, track: track[id] }));
        }""")

        # ④ 실제 1군 경기 1회 — 경기 EXP 리포트(레벨업·EXP)와 90분 완주
        pg.evaluate("""() => {
          const S = DS.game.state();
          S.tut = { done: true, step: 0, runs: 1 };
          DS.game.save(); DS.game.renderAll();
        }""")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2200)
        res['before'] = pg.evaluate("""() => {
          const S = DS.game.state();
          return S.squad.slice(0, 11).map(p => ({ name: p.name, age: p.age, ovr: DS.ratingOf(p), pot: p.pot, lv: p.level, exp: p.exp || 0 }));
        }""")
        res['full'] = pg.evaluate("""() => new Promise(resolve => {
          let n = 0, t0 = performance.now();
          function tick() {
            n++;
            if (n < 90) { requestAnimationFrame(tick); return; }
            const dt = (performance.now() - t0) / 1000;
            const r = DS.Match.qaSim();
            resolve({ fps: Math.round(n / dt * 10) / 10, res: r, phase: DS.Match.phase,
                      clock: DS.Match.clock, running: DS.Match.running,
                      tokens: DS.Match.probe ? DS.Match.probe().art : null });
          }
          requestAnimationFrame(tick);
        })""")
        pg.wait_for_timeout(900)
        pg.screenshot(path=f'{OUT}/v39b-result-844x390.png')
        res['expReport'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const r = S.lastReport;
          const rows = (r && r.expGain ? r.expGain : []).slice(0, 11).map(x => ({ name: x.name, exp: x.exp, levels: x.levels, lv: x.level, need: x.need }));
          return { rows: rows, n: (r && r.expGain ? r.expGain.length : 0) };
        }""")

        # ⑤ 선수 상세창 성장 블록 (레벨 / 경기 EXP 바 / 누적 성장 / 유소년 배율)
        pg.evaluate("""() => {
          const ov = document.getElementById('m-overlay');
          if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
          const S = DS.game.state();
          DS.game.playerModal(S.squad[0]);
        }""")
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'{OUT}/v39b-detail-growth-844x390.png')
        res['squad0'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const p = S.squad[0];
          return p ? { keys: Object.keys(p).slice(0, 12), pos: p.pos, name: p.name, n: S.squad.length } : { empty: true, n: S.squad.length };
        }""")
        res['detail'] = pg.evaluate("""() => {
          const m = document.getElementById('modal');
          const g = document.querySelector('#modal .growth');
          const pq = document.querySelector('#modal .pot-gauge, #modal .pg, #modal .pg-wrap');
          return { growth: g ? g.innerText.replace(/\\n/g, ' | ') : null,
                   pot: pq ? pq.innerText.replace(/\\n/g, ' | ') : null,
                   open: !!m && m.className.indexOf('on') >= 0,
                   head: m ? (m.innerText || '').split('\\n').slice(0, 6).join(' | ') : null };
        }""")

        # ⑥ 특훈 체감 — 실제 UI 경로(menu 2개 선택 → 특훈 실행) 3회
        pg.evaluate("""() => {
          const m = document.getElementById('modal'); if (m) { m.className = ''; m.innerHTML = ''; }
          const S = DS.game.state();
          S.money = 900000;
          DS.game.setTab('club'); DS.game.renderAll();
        }""")
        pg.wait_for_timeout(600)
        res['train'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const p = S.squad[0];
          return { name: p.name, age: p.age, ovr: DS.ratingOf(p), lv: p.level || 0,
                   exp: p.exp || 0, need: DS.expToNext(p.level || 0),
                   s: DS.effStat(p, 's'), t: DS.effStat(p, 't'), pw: DS.effStat(p, 'p') };
        }""")
        toasts = []
        for i in range(3):
            pg.click('#screen-club [data-act="trainmenu"][data-k="shoot"]')
            pg.click('#screen-club [data-act="trainmenu"][data-k="pass"]')
            pg.wait_for_timeout(150)
            pg.click('#screen-club [data-act="trainrun"]')
            pg.wait_for_timeout(350)
            toasts.append(pg.evaluate("() => document.getElementById('toast').textContent"))
        res['trainToasts'] = toasts
        res['trainAfter'] = pg.evaluate("""() => {
          const S = DS.game.state();
          const p = S.squad[0];
          return { ovr: DS.ratingOf(p), lv: p.level || 0, exp: p.exp || 0, need: DS.expToNext(p.level || 0),
                   s: DS.effStat(p, 's'), t: DS.effStat(p, 't'), p: DS.effStat(p, 'p'),
                   dev: Math.round((p.dev || 0) * 100) / 100 };
        }""")
        pg.screenshot(path=f'{OUT}/v39b-train-844x390.png')

        res['errs'] = errs[:6]
        res['console'] = console[:8]
        res['bad'] = bad[:6]
        b.close()
finally:
    srv.terminate()

print(json.dumps(res, ensure_ascii=False, indent=1))
