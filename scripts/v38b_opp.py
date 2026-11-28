#!/usr/bin/env python3
"""상대 스쿼드(buildAwaySquad) 실제 OVR vs 표기 strength, 유저 초기 11명 OVR 확인."""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright
ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = 8153
URL = f'http://127.0.0.1:{PORT}/index.html?v=38&b=38'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
JS = r"""
() => {
  const G = DS.game, S = G.state();
  const out = { squad: [], opp: [] };
  const byId = {}; (S.squad || []).forEach(p => { byId[p.id] = p; });
  out.squad = S.lineup.map(id => byId[id] ? DS.ratingOf(byId[id]) : null);
  out.squadAvg = out.squad.reduce((a, b) => a + (b || 0), 0) / out.squad.length;
  const f = DS.FORMATIONS['4-4-2'];
  const teams = DS.TEAMS.slice(0, 40);
  for (const t of teams) {
    let sum = 0, n = 0;
    for (let r = 0; r < 3; r++) {
      for (const s of f.slots) {
        const p = DS.makePlayer({ pos: s.pos, rarity: 'eun' });
        const target = t.strength + (Math.random() * 8 - 4);
        const sc = target / Math.max(30, DS.ratingOf(p));
        p.s = Math.min(10, Math.max(1, Math.round(p.s * sc * 1.04)));
        p.t = Math.min(10, Math.max(1, Math.round(p.t * sc * 1.04)));
        p.p = Math.min(10, Math.max(1, Math.round(p.p * sc * 1.04)));
        sum += DS.ratingOf(p); n++;
      }
    }
    out.opp.push({ div: t.division, strength: t.strength, ovr: Math.round(sum / n * 10) / 10 });
  }
  return out;
}
"""
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={'width': 844, 'height': 390})
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)
        print(json.dumps(pg.evaluate(JS), ensure_ascii=False, indent=1))
        b.close()
finally:
    srv.terminate()
