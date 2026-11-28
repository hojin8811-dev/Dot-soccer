#!/usr/bin/env python3
"""v39c 진단 — 레인 편향 / 백패스 / 오프사이드 실측 덤프.

사용:
  python3 scripts/v39c_diag.py [경기수] [홈OVR] [원정OVR]
QA: DS.Match.qaSim() 으로 90분을 돌려 v35/v39/v33 계측을 모은다.
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8170'))
B = os.environ.get('BUILD', '40')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

args = [a for a in sys.argv[1:] if not a.startswith('--')]
N = int(args[0]) if args else 4
HOVR = int(args[1]) if len(args) > 1 else 62
AOVR = int(args[2]) if len(args) > 2 else 62
FORM_H = os.environ.get('FORM_H', '4-4-2')

BUILD_JS = r"""
(args) => {
  const HOVR = args.hovr, AOVR = args.aovr, FORM = args.form;
  const f = DS.FORMATIONS[FORM];
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
    lineup: home, bench: [], homeFormation: FORM,
    awayPlayers: awayP, awayFormation: FORM,
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
  r.v35 = M.v35();
  r.v39 = M.v39();
  r.v33 = M.v33();
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
        if pg.evaluate("() => DS.Match.running"):
            pg.evaluate("() => { DS.Match.stop(); }")
        pg.evaluate(BUILD_JS, {'hovr': HOVR, 'aovr': AOVR, 'form': FORM_H})
        for i in range(N):
            r = pg.evaluate(RUN_JS)
            if r:
                out.append({
                    'score': f"{r['home']}:{r['away']}",
                    'shots': r['shots'], 'xg': r['xg'], 'poss': r['poss'],
                    'lanesAtk': r['v35']['lanesAtk'], 'lanes': r['v35']['lanes'],
                    'switch': r['v35']['switchPass'], 'cross': r['v35']['cross'],
                    'flankEntry': r['v35']['flankEntry'],
                    'offside': r['v33']['offside'],
                    'act': r['v39']['act'], 'v39extra': {k: r['v39'].get(k) for k in
                        ('atkThirdBlocked', 'atkThirdPass', 'solo', 'soloBy', 'openChance', 'openShots')},
                })
        errs += pg.evaluate("() => (window.__DS_ERRS || [])")
        if errs:
            out.append({'errs': errs[:6]})
        b.close()
finally:
    srv.terminate()

print(json.dumps(out, ensure_ascii=False, indent=1))
