#!/usr/bin/env python3
"""v39 진단 — 한 경기의 의사결정 구간·슈팅 거리·점유·전개 지표를 그대로 덤프한다.
사용: python3 scripts/v39_diag.py [홈OVR] [원정OVR]
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8163'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b=39'
HOVR = int(sys.argv[1]) if len(sys.argv) > 1 else 62
AOVR = int(sys.argv[2]) if len(sys.argv) > 2 else 62
N = int(sys.argv[3]) if len(sys.argv) > 3 else 1

BUILD = r"""
(a) => {
  const f = DS.FORMATIONS['4-4-2'];
  function mk(pos, idx, tag, ovr) {
    let best = null, bd = 99;
    for (let v = 1; v <= 10; v += 0.01) {
      const p = DS.makePlayer({ pos: pos, s: v, t: v, p: v, pot: 99, rarity: 'dong',
        trait: 'diligent', lock: 'fight', age: 25 });
      const r = DS.ratingOf(p), d = Math.abs(r - ovr);
      if (d < bd) { bd = d; best = p; }
      if (r === ovr) break;
    }
    best.pic = (idx * 7 + (tag === 'H' ? 1 : 3)) % 500 + 1;
    return best;
  }
  const home = [], awayP = [];
  for (let i = 0; i < 11; i++) {
    const s = f.slots[i];
    home.push({ player: mk(s.pos, i, 'H', a.h), role: s.role, pos: s.pos, x: s.x, y: s.y });
    awayP.push(mk(s.pos, i, 'A', a.aw));
  }
  window.__C = {
    homeName: 'H', awayName: 'A', homeShort: 'H', awayShort: 'A',
    homeKit: '#2f8dff', awayKit: '#ff4b4b', homeEmblem: 1, awayEmblem: 2,
    lineup: home, bench: [], homeFormation: '4-4-2', awayPlayers: awayP, awayFormation: '4-4-2',
    homeTacticStyle: 'balanced', awayTacticStyle: 'balanced', tactics: 'balanced',
    condition: 80, morale: 66, ctac: { line: 50, press: 50, wide: 50 }, deck: [],
    managerFx: {}, roles: {}, kind: 'league'
  };
  return true;
}
"""
RUN = r"""
() => {
  const M = DS.Match;
  if (M.running) M.stop();
  M.start(window.__C);
  const r = M.qaSim();
  return { home: r.home, away: r.away, shots: r.shots, xg: r.xg, poss: r.poss, gap: r.gap,
           v39: M.v39(), tele: M.tele(), lineY: M.v38().lineY, press: M.v38().press };
}
"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        pg.evaluate("() => { const S=DS.game.state(); S.tut={done:true,step:0,runs:1}; DS.game.save(); DS.game.renderAll(); }")
        pg.click('#screen-home [data-act="kickoff"]')
        pg.wait_for_timeout(2000)
        pg.evaluate(BUILD, {'h': HOVR, 'aw': AOVR})
        for i in range(N):
            r = pg.evaluate(RUN)
            print(json.dumps({k: r[k] for k in ['home', 'away', 'shots', 'xg', 'poss', 'gap', 'lineY', 'press']}, ensure_ascii=False))
            print(' zone', json.dumps(r['v39']['zone']), 'shotDist', json.dumps(r['v39']['shotDist']),
                  'open', r['v39']['openChance'], r['v39']['openShots'], 'blocked', r['v39']['atkThirdBackBlocked'], 'solo', r['v39'].get('solo'), r['v39'].get('soloBy'), 'try', r['v39'].get('soloTry'))
            print(' act', json.dumps(r['v39']['act'], ensure_ascii=False))
        print('errs', errs[:4])
        b.close()
finally:
    srv.terminate()
