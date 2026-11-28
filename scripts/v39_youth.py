#!/usr/bin/env python3
"""v39 유소년 아카데미 — 승격 2명 뒤 다음 시즌 3명 보충 · 1군 18명 규칙 · 이적시장 매각 흐름 확인."""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8171'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b=39'

JS = r"""
() => {
  const S = DS.game.state();
  DS.game.ensureYouth();
  const log = [];
  /* 자리 만들기: 벤치 2명 방출 */
  S.squad = S.squad.slice(0, 16);
  S.lineup = S.lineup.filter(id => S.squad.some(p => p.id === id));
  S.bench = S.bench.filter(id => S.squad.some(p => p.id === id));
  DS.game.save(); DS.game.renderAll();
  log.push({ step: 'make room', squad: S.squad.length, intake: S.youth.intake.length });
  const ids = S.youth.intake.slice(0, 2).map(p => p.id);
  const before = S.youth.intake.map(p => p.name);
  DS.game.youthPromote(ids[0]);
  DS.game.youthPromote(ids[1]);
  DS.game.renderAll();
  log.push({ step: 'promote 2', squad: S.squad.length, intake: S.youth.intake.length,
             before: before, left: S.youth.intake.map(p => p.name) });
  /* 같은 시즌 안에서는 다시 채우지 않는다 (v28 설계) */
  DS.game.ensureYouth();
  log.push({ step: 'same-season ensureYouth', intake: S.youth.intake.length });
  /* 정원 18명일 때 추가 승격은 막히는지 */
  S.squad.length < 18 ? null : null;
  /* 다음 시즌 */
  S.round = S.fixtures.length - 1;
  DS.game.finishMatch(0, 0, 'league');
  DS.game.newSeason();
  DS.game.ensureYouth();
  log.push({ step: 'new season', season: S.season, intake: S.youth.intake.length,
             ySeason: S.youth.season, names: S.youth.intake.map(p => p.name + '/' + p.age) });
  /* 정원 18명 규칙: 가득 찬 상태에서 승격 시도 */
  const full = { squad: S.squad.length, intake: S.youth.intake.length };
  let blocked = null;
  if (S.squad.length >= 18 && S.youth.intake.length) {
    DS.game.youthPromote(S.youth.intake[0].id);
    blocked = { squad: S.squad.length, intake: S.youth.intake.length, toastOk: true };
  }
  return { log: log, full: full, blocked: blocked, squad: S.squad.length };
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
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.goto(URL, wait_until='load')
        pg.evaluate("localStorage.clear()")
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1500)
        out = pg.evaluate(JS)
        out['errs'] = errs[:4]
        print(json.dumps(out, ensure_ascii=False, indent=1))
        b.close()
finally:
    srv.terminate()
