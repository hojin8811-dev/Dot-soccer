#!/usr/bin/env python3
"""v39c 검증 — 화면 표시 전력(teamPower) vs 상대 strength vs 실제 경기 결과.

사용:
  python3 scripts/v39c_check.py [경기수] [포메이션] [--before] [--oppmax 60]

  · 새 세이브를 만들어 선발 11명을 버프해 teamPower 80 이상으로 만든다 (실제 UI 경로와 같은 함수).
  · DS.game.qaCfg() 로 startMatch 와 동일한 cfg를 받아 DS.Match.qaSim() 으로 90분을 돌린다.
  · --before 를 주면 cfg 에서 homePower/awayPower 를 지워 v39b 방식(raw OVR 평균)으로 계산한다.
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ.get('LD_LIBRARY_PATH', ''))
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8210'))
B = os.environ.get('BUILD', '41')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
N = int(args[0]) if args else 10
FORM = args[1] if len(args) > 1 else '3-4-1-2'
BEFORE = '--before' in sys.argv
OPPMAX = 60
for a in sys.argv[1:]:
    if a.startswith('--oppmax='): OPPMAX = int(a.split('=')[1])

SETUP_JS = r"""
(args) => {
  const G = DS.game, S = G.state();
  S.tut = { done: true, step: 0, runs: 1 };
  S.formation = args.form;
  S.condition = 90; S.morale = 75;
  // 유저 세이브 재현: 선발 11명이 슬롯에 딱 맞는 선수(적성 10)라 화면 전력이 실제 OVR보다 ~+10 높다
  const byId = {}; S.squad.forEach(p => { byId[p.id] = p; });
  const st = S.lineup.map(id => byId[id]).filter(Boolean);
  const f = DS.FORMATIONS[S.formation];
  st.forEach((p, i) => {
    const sl = f.slots[i]; if (!sl) { return; }
    p.apt = p.apt || {}; p.apt[sl.pos] = 10;
    p.pos = sl.pos;                       // 자기 자리(포지션 일치 +2)
    if (sl.k) { p.apt[sl.pos] = 10; }
  });
  function bump(v) {
    st.forEach(p => { p.s = v; p.t = v; p.p = v; p.pot = 99; p.stats = DS.statSheet(p); });
  }
  let power = 0, v = 4;
  for (; v <= 9.6; v += 0.05) {
    bump(v); power = G.teamPower();
    if (power >= 80) { break; }
  }
  // 상대: strength 가 가장 낮은 리그 팀
  let opp = null;
  DS.TEAMS.forEach(t => { if (t.division === 2) { if (!opp || t.strength < opp.strength) { opp = t; } } });
  G.save(); G.renderAll();
  return { power: power, v: Math.round(v * 100) / 100, opp: opp.short, oppStrength: opp.strength, oppId: opp.id,
           formation: S.formation, lineup: st.length };
}
"""

RUN_JS = r"""
(args) => {
  const G = DS.game, M = DS.Match;
  const q = G.qaCfg('smatch', { teamId: args.oppId });
  if (!q) { return { err: 'no cfg' }; }
  const cfg = q.cfg;
  if (args.before) { delete cfg.homePower; delete cfg.awayPower; }
  const games = [];
  for (let g = 0; g < args.n; g++) {
    if (M.running) { M.stop(); }
    M.start(cfg);
    const r = M.qaSim();
    if (!r) { continue; }
    const v35 = M.v35(), v39 = M.v39(), v33 = M.v33();
    games.push({ h: r.home, a: r.away, shots: r.shots, xg: r.xg, poss: r.poss, gap: r.gap,
      v33gap: v33.gap, lane: v39.atkLaneSide, pass: v39.passDir, backBlocked: v39.atkThirdBackBlocked,
      halfBlocked: v39.atkHalfBackBlocked, backTry: v39.backPassTry, backOk: v39.backPassOk,
      offside: v33.offside, act: v39.act, shotX: v39.shotX });
  }
  return { meta: { teamPower: q.teamPower, oppStrength: q.oppStrength, oppName: q.oppName,
      awayFormation: q.awayFormation, homeRawAvg: q.homeRawAvg, awayRawAvg: q.awayRawAvg,
      homePowerEff: q.homePowerEff, awayPowerEff: q.awayPowerEff, cfgHome: q.cfg.homePower, cfgAway: q.cfg.awayPower,
      before: args.before }, games: games };
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
res, errs = None, []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        setup = pg.evaluate(SETUP_JS, {'form': FORM})
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(1500)
        if pg.evaluate("() => DS.Match.running"): pg.evaluate("() => DS.Match.stop()")
        res = pg.evaluate(RUN_JS, {'n': N, 'before': BEFORE, 'oppId': setup['oppId']})
        errs += pg.evaluate("() => (window.__DS_ERRS || [])")
        b.close()
finally:
    srv.terminate()

out = {'setup': setup, 'meta': (res or {}).get('meta'), 'errs': errs[:5]}
gs = (res or {}).get('games') or []
n = len(gs)
if n:
    tot = lambda f: sum(f(g) for g in gs)
    lane = {'home': {'l': 0, 'c': 0, 'r': 0}, 'away': {'l': 0, 'c': 0, 'r': 0}}
    pd = {}
    act = {}
    sx = {'home': {'l': 0, 'c': 0, 'r': 0}, 'away': {'l': 0, 'c': 0, 'r': 0}}
    for g in gs:
        for side in ('home', 'away'):
            for k in 'lcr': lane[side][k] += g['lane'][side][k]; sx[side][k] += g['shotX'][side][k]
            for k, v in g['pass'][side].items(): pd.setdefault(side, {}).setdefault(k, 0); pd[side][k] += v
            for k, v in g['act'][side].items(): act.setdefault(side, {}).setdefault(k, 0); act[side][k] += v
    def pct(o):
        t = o['l'] + o['c'] + o['r'] or 1
        return {k: round(o[k] / t * 100, 1) for k in 'lcr'}
    ofs = {}
    for g in gs:
        for k, v in (g['offside'] or {}).items(): ofs[k] = ofs.get(k, 0) + v
    out['result'] = {
        'games': n,
        'record': f"{sum(1 for g in gs if g['h']>g['a'])}승 {sum(1 for g in gs if g['h']==g['a'])}무 {sum(1 for g in gs if g['h']<g['a'])}패",
        'win%': round(sum(1 for g in gs if g['h'] > g['a']) / n * 100),
        'goals_pm': f"{tot(lambda g: g['h'])/n:.2f} : {tot(lambda g: g['a'])/n:.2f}",
        'shots_pm': f"{tot(lambda g: g['shots']['home'])/n:.1f} : {tot(lambda g: g['shots']['away'])/n:.1f}",
        'xg_pm': f"{tot(lambda g: g['xg']['home'])/n:.2f} : {tot(lambda g: g['xg']['away'])/n:.2f}",
        'poss_home': round(tot(lambda g: g['poss']) / n, 1),
        'gap': gs[0]['gap'], 'v33gap': gs[0]['v33gap'],
        'laneAtkPct': {s: pct(v) for s, v in lane.items()},
        'shotXPct': {s: pct(v) for s, v in sx.items()},
        'passDir_pm': {s: {k: round(v / n, 1) for k, v in d.items()} for s, d in pd.items()},
        'act_pm': {s: {k: round(v / n, 1) for k, v in d.items()} for s, d in act.items()},
        'backBlocked_pm': round(tot(lambda g: g['backBlocked'] or 0) / n, 1),
        'halfBlocked_pm': round(tot(lambda g: g['halfBlocked'] or 0) / n, 1),
        'backTry_pm': {s: round(tot(lambda g: g['backTry'][s]) / n, 2) for s in ('home', 'away')},
        'backOk_pm': {s: round(tot(lambda g: g['backOk'][s]) / n, 2) for s in ('home', 'away')},
        'offside_pm': {k: round(v / n, 2) for k, v in ofs.items()},
        'scores': [f"{g['h']}:{g['a']}" for g in gs],
    }
print(json.dumps(out, ensure_ascii=False, indent=1))
