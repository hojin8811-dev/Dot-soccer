#!/usr/bin/env python3
"""v39c 실측 하네스 — 레인 편향 · 후진 패스 · 오프사이드 (수정 전/후 비교용).

사용:
  python3 scripts/v39c_sim.py [경기수] [홈OVR] [원정OVR] [포메이션]
  예) python3 scripts/v39c_sim.py 10 62 62 4-4-2
QA: DS.Match.qaSim() 으로 90분을 동기 시뮬하고 M.v35/v39/v33 계측을 집계한다.
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = os.environ.get('ROOT', '/workspace/dot-soccer-v18')
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8176'))
B = os.environ.get('BUILD', '40')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
N = int(args[0]) if args else 10
HOVR = int(args[1]) if len(args) > 1 else 62
AOVR = int(args[2]) if len(args) > 2 else 62
FORM = args[3] if len(args) > 3 else '4-4-2'
AFORM = args[4] if len(args) > 4 else FORM

BUILD_JS = r"""
(args) => {
  const HOVR = args.hovr, AOVR = args.aovr, FORM = args.form, AFORM = args.aform;
  const f = DS.FORMATIONS[FORM], af = DS.FORMATIONS[AFORM];
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
  }
  for (let i = 0; i < 11; i++) {
    awayP.push(mkExact(af.slots[i].pos, i, 'A', AOVR));
  }
  const cfg = {
    homeName: 'H', awayName: 'A', homeShort: 'H', awayShort: 'A',
    homeKit: '#2f8dff', awayKit: '#ff4b4b', homeEmblem: 1, awayEmblem: 2,
    lineup: home, bench: [], homeFormation: FORM,
    awayPlayers: awayP, awayFormation: AFORM,
    homeTacticStyle: 'balanced', awayTacticStyle: 'balanced',
    tactics: 'balanced', condition: 80, morale: 66,
    ctac: { line: 50, press: 50, wide: 50 }, deck: [], managerFx: {}, roles: {},
    kind: 'league'
  };
  window.__B = { cfg: cfg, games: [] };
  return { ok: true };
}
"""

RUN_JS = r"""
() => {
  const M = DS.Match, st = window.__B;
  if (M.running) { M.stop(); }
  M.start(st.cfg);
  const r = M.qaSim();
  if (!r) { return null; }
  r.v35 = M.v35(); r.v39 = M.v39(); r.v33 = M.v33();
  st.games.push(r);
  return r;
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
rows, errs = [], []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(1800)
        if pg.evaluate("() => DS.Match.running"):
            pg.evaluate("() => { DS.Match.stop(); }")
        pg.evaluate(BUILD_JS, {'hovr': HOVR, 'aovr': AOVR, 'form': FORM, 'aform': AFORM})
        for i in range(N):
            r = pg.evaluate(RUN_JS)
            if r:
                rows.append(r)
        errs += pg.evaluate("() => (window.__DS_ERRS || [])")
        b.close()
finally:
    srv.terminate()

n = len(rows)
def s(key, sub=None):
    if not n: return 0
    return sum((r[key][sub] if sub else r[key]) for r in rows) / n

def sumd(key):
    out = {}
    for r in rows:
        for k, v in r['v39'][key].items():
            if isinstance(v, dict):
                out.setdefault(k, {})
                for k2, v2 in v.items():
                    out[k][k2] = out[k].get(k2, 0) + v2
            else:
                out[k] = out.get(k, 0) + v
    return out

lanes = sumd('atkLaneSide')
shotx = sumd('shotX')
pd = sumd('passDir')
act = sumd('act')
ofs = {}
for r in rows:
    for k, v in (r['v33']['offside'] or {}).items():
        ofs[k] = ofs.get(k, 0) + v
def lanePct(o):
    t = o['l'] + o['c'] + o['r'] or 1
    return {k: round(o[k] / t * 100, 1) for k in ('l', 'c', 'r')}
out = {
    'games': n, 'form': FORM + ' vs ' + AFORM, 'ovr': f'{HOVR} vs {AOVR}',
    'score_pm': f"{sum(r['home'] for r in rows)/n:.1f} : {sum(r['away'] for r in rows)/n:.1f}",
    'result': f"{sum(1 for r in rows if r['home']>r['away'])}승 {sum(1 for r in rows if r['home']==r['away'])}무 {sum(1 for r in rows if r['home']<r['away'])}패",
    'shots_pm': f"{sum(r['shots']['home'] for r in rows)/n:.1f} : {sum(r['shots']['away'] for r in rows)/n:.1f}",
    'xg_pm': f"{sum(r['xg']['home'] for r in rows)/n:.2f} : {sum(r['xg']['away'] for r in rows)/n:.2f}",
    'poss': round(sum(r['poss'] for r in rows)/n, 1),
    'laneAtkPct': {k: lanePct(v) for k, v in lanes.items()},
    'laneAtkRaw': lanes,
    'shotXPct': {k: lanePct(v) for k, v in shotx.items()},
    'passDir_pm': {k: {kk: round(vv/n, 1) for kk, vv in v.items()} for k, v in pd.items()},
    'act_pm': {k: {kk: round(vv/n, 1) for kk, vv in v.items()} for k, v in act.items()},
    'offside_total': ofs, 'offside_pm': {k: round(v/n, 2) for k, v in ofs.items()},
    'offside_team_pm': round(sum(ofs.values())/n/2, 2),
    'solo_pm': {k: round(v/n, 1) for k, v in sumd('soloBy').items()},
}
if errs: out['errs'] = errs[:5]
print(json.dumps(out, ensure_ascii=False, indent=1))
