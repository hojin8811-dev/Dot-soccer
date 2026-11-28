#!/usr/bin/env python3
"""v38b 밸런스 — 동일 OVR · 무조작(ctac 50/50/50, 전술카드 미사용) 대칭 10경기.

홈/원정에 **완전히 같은 선수 구성**(포지션·능력치·성향)을 넣고 90분을 동기 시뮬
(`DS.Match.qaSim`)로 돌려 승률·득점·실점·xG·슈팅·점유율이 구조적으로 한쪽에
치우치는지 본다.  사용: python3 scripts/v38b_balance.py [경기수] [컨디션] [사기]
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8152'))
B = os.environ.get('BUILD', '38')
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b={B}'

N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
COND = int(sys.argv[2]) if len(sys.argv) > 2 else 80
MOR = int(sys.argv[3]) if len(sys.argv) > 3 else 66

BUILD_JS = r"""
(args) => {
  const N = args.n, COND = args.cond, MOR = args.mor, OVR = 62;
  const f = DS.FORMATIONS['4-4-2'];
  /* 목표 OVR과 정확히 일치하는 s/t/p(같은 값) 찾기 — 홈·원정이 같은 능력치를 갖는다 */
  function mkExact(pos, idx, tag) {
    let best = null, bestD = 99;
    for (let v = 1; v <= 10; v += 0.01) {
      const p = DS.makePlayer({ pos: pos, s: v, t: v, p: v, pot: 99, rarity: 'dong',
        trait: 'diligent', lock: 'fight', age: 25, tenure: 2, number: idx + 1,
        name: tag + '-' + (idx + 1) });
      const r = DS.ratingOf(p), d = Math.abs(r - OVR);
      if (d < bestD) { bestD = d; best = p; }
      if (r === OVR) { break; }
    }
    best.lock = 'fight'; best.trait = 'diligent';
    best.pic = (idx * 7 + (tag === 'H' ? 1 : 3)) % 500 + 1;
    return best;
  }
  const home = [], awayP = [];
  for (let i = 0; i < 11; i++) {
    const s = f.slots[i];
    home.push({ player: mkExact(s.pos, i, 'H'), role: s.role, pos: s.pos, x: s.x, y: s.y });
    awayP.push(mkExact(s.pos, i, 'A'));
  }
  const cfg = {
    homeName: 'H', awayName: 'A', homeShort: 'H', awayShort: 'A',
    homeKit: '#2f8dff', awayKit: '#ff4b4b', homeEmblem: 1, awayEmblem: 2,
    lineup: home, bench: [], homeFormation: '4-4-2',
    awayPlayers: awayP, awayFormation: '4-4-2',
    homeTacticStyle: 'balanced', awayTacticStyle: 'balanced',
    tactics: 'balanced', condition: COND, morale: MOR,
    ctac: { line: 50, press: 50, wide: 50 }, deck: [], managerFx: {}, roles: {},
    kind: 'league'
  };
  window.__B = { home: home, awayP: awayP, cfg: cfg, games: [] };
  return {
    ovr: home.map(h => DS.ratingOf(h.player)),
    avg: home.reduce((a, h) => a + DS.ratingOf(h.player), 0) / 11
  };
}
"""

RUN_JS = r"""
() => {
  const M = DS.Match, st = window.__B;
  if (M.running) { M.stop(); }
  M.start(st.cfg);
  const r = M.qaSim();
  r.tele = M.tele();
  st.games.push(r);
  return r;
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
out = {}
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        # 경기 화면 DOM(#m-pitch)을 만들기 위해 한 번 킥오프한다.
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; S.condition=90; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2200)
        has_canvas = pg.evaluate("() => !!document.getElementById('m-pitch')")
        ovr = pg.evaluate(BUILD_JS, {'n': N, 'cond': COND, 'mor': MOR})
        games = []
        for i in range(N):
            games.append(pg.evaluate(RUN_JS))
        errs += pg.evaluate("() => (window.__DS_ERRS || [])")
        out = {'canvas': has_canvas, 'ovr': ovr, 'games': games, 'errs': errs[:8]}
        b.close()
finally:
    srv.terminate()

gs = [g for g in out.get('games', []) if g]
hw = sum(1 for g in gs if g['home'] > g['away'])
aw = sum(1 for g in gs if g['away'] > g['home'])
dr = sum(1 for g in gs if g['home'] == g['away'])
hg = sum(g['home'] for g in gs); ag = sum(g['away'] for g in gs)
hs = sum(g['shots']['home'] for g in gs); as_ = sum(g['shots']['away'] for g in gs)
hx = sum(g['xg']['home'] for g in gs); ax = sum(g['xg']['away'] for g in gs)
hp = sum(g['poss'] for g in gs) / max(1, len(gs))
summary = {
    'condition': COND, 'morale': MOR, 'n': len(gs),
    'ovr_avg': round(out.get('ovr', {}).get('avg', 0), 2), 'gap': gs[0]['gap'] if gs else None,
    'home_win': hw, 'draw': dr, 'away_win': aw,
    'goals': {'home': hg, 'away': ag},
    'shots': {'home': hs, 'away': as_},
    'xg': {'home': round(hx, 1), 'away': round(ax, 1)},
    'poss_avg': round(hp, 1),
    'formFactor': gs[0]['formFactor'] if gs else None,
    'scores': [f"{g['home']}:{g['away']}" for g in gs],
    'aiShifts': [g['aiShifts'] for g in gs],
    'tele1': gs[0].get('tele') if gs else None,
    'errs': out.get('errs'),
    'canvas': out.get('canvas'),
}
print(json.dumps(summary, ensure_ascii=False, indent=1))
