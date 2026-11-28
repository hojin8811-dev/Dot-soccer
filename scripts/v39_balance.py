#!/usr/bin/env python3
"""v39 전력차·득점 밸런스 — 홈/원정 OVR을 지정해 무조작 90분을 동기 시뮬한다.

사용:
  python3 scripts/v39_balance.py                      # 62 vs 62 · 62 vs 62 · 70 vs 60 · 80 vs 60 (12경기씩)
  python3 scripts/v39_balance.py 62 62 20             # 홈 OVR 62 · 원정 62 · 20경기
  python3 scripts/v39_balance.py 70 60 20 --cond 80 --mor 66
QA: DS.Match.qaSim() 으로 90분을 한 번에 돌리고 득점·슈팅·xG·점유율·승률을 집계한다.
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8162'))
B = os.environ.get('BUILD', '39')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
COND = 80
MOR = 66
for a in sys.argv[1:]:
    if a.startswith('--cond='): COND = int(a.split('=')[1])
    if a.startswith('--mor='): MOR = int(a.split('=')[1])
MATCHUPS = [(int(args[0]), int(args[1]), int(args[2]))] if len(args) >= 3 else [
    (62, 62, 12), (70, 60, 12), (80, 60, 12)]

BUILD_JS = r"""
(args) => {
  const HOVR = args.hovr, AOVR = args.aovr, COND = args.cond, MOR = args.mor;
  const f = DS.FORMATIONS['4-4-2'];
  function mkExact(pos, idx, tag, ovr) {
    let best = null, bestD = 99;
    for (let v = 1; v <= 10; v += 0.01) {
      const p = DS.makePlayer({ pos: pos, s: v, t: v, p: v, pot: 99, rarity: 'dong',
        trait: 'diligent', lock: 'fight', age: 25, tenure: 2, number: idx + 1,
        name: tag + '-' + (idx + 1) });
      const r = DS.ratingOf(p), d = Math.abs(r - ovr);
      if (d < bestD) { bestD = d; best = p; }
      if (r === ovr) { break; }
    }
    best.lock = 'fight'; best.trait = 'diligent';
    best.pic = (idx * 7 + (tag === 'H' ? 1 : 3)) % 500 + 1;
    return best;
  }
  const home = [], awayP = [];
  for (let i = 0; i < 11; i++) {
    const s = f.slots[i];
    home.push({ player: mkExact(s.pos, i, 'H', HOVR), role: s.role, pos: s.pos, x: s.x, y: s.y });
    awayP.push(mkExact(s.pos, i, 'A', AOVR));
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
  window.__B = { cfg: cfg, games: [] };
  return { homeOvr: Math.round(home.reduce((a, h) => a + DS.ratingOf(h.player), 0) / 11 * 10) / 10,
           awayOvr: Math.round(awayP.reduce((a, h) => a + DS.ratingOf(h), 0) / 11 * 10) / 10 };
}
"""

RUN_JS = r"""
() => {
  const M = DS.Match, st = window.__B;
  if (M.running) { M.stop(); }
  M.start(st.cfg);
  const r = M.qaSim();
  r.v39 = M.v39();
  st.games.push(r);
  return r;
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
out = []
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
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2000)
        for (h, a, n) in MATCHUPS:
            ov = pg.evaluate(BUILD_JS, {'hovr': h, 'aovr': a, 'cond': COND, 'mor': MOR})
            games = []
            for i in range(n):
                games.append(pg.evaluate(RUN_JS))
            out.append({'pair': f'{h} vs {a}', 'ovr': ov, 'games': games})
        errs += pg.evaluate("() => (window.__DS_ERRS || [])")
        if errs:
            out.append({'errs': errs[:6]})
        b.close()
finally:
    srv.terminate()

report = []
for blk in out:
    if 'games' not in blk:
        report.append(blk); continue
    gs = [g for g in blk['games'] if g]
    n = len(gs)
    hw = sum(1 for g in gs if g['home'] > g['away'])
    aw = sum(1 for g in gs if g['away'] > g['home'])
    dr = sum(1 for g in gs if g['home'] == g['away'])
    hg = sum(g['home'] for g in gs); ag = sum(g['away'] for g in gs)
    hs = sum(g['shots']['home'] for g in gs); as_ = sum(g['shots']['away'] for g in gs)
    hx = sum(g['xg']['home'] for g in gs); ax = sum(g['xg']['away'] for g in gs)
    hposs = sum(g['poss'] for g in gs) / max(1, n)
    zz = sum(1 for g in gs if g['home'] == 0 and g['away'] == 0)
    report.append({
        'pair': blk['pair'], 'ovr': blk['ovr'], 'n': n,
        'win%': round(hw / n * 100), 'draw%': round(dr / n * 100), 'loss%': round(aw / n * 100),
        'goals_pm': f"{hg / n:.2f} : {ag / n:.2f}", 'shots_pm': f"{hs / n:.1f} : {as_ / n:.1f}",
        'xg_pm': f"{hx / n:.2f} : {ax / n:.2f}", 'poss_home%': round(hposs, 1),
        '0:0%': round(zz / n * 100), 'gap': gs[0].get('gap'),
        'scores': [f"{g['home']}:{g['away']}" for g in gs],
        'v39': gs[0].get('v39')
    })
print(json.dumps(report, ensure_ascii=False, indent=1))
