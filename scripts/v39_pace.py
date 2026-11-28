#!/usr/bin/env python3
"""v39 성장 페이스 — 1군·유소년 선수가 잠재 상한까지 가는 속도를 라운드 단위로 계측한다.

사용: python3 scripts/v39_pace.py [빌드번호]
  · 1군: 동 등급 OVR 58 (잠재 70) 23세, 리그 라운드마다 평점 6.3 출전 EXP + 4라운드마다 1회 특훈
  · 1군 은: OVR 64 (잠재 74) 25세
  · 유소년: OVR 58 (잠재 76) 16세, 2군 경기(라운드마다) EXP, 4라운드마다 1회 특훈
  · 결과: 잠재 도달 라운드, 시즌(38R) 말 OVR, 2시즌(76R) 말 OVR
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8161'))
B = sys.argv[1] if len(sys.argv) > 1 else '39'
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

JS = r"""
() => {
  /* 목표 OVR에 맞는 s/t/p 찾기 */
  function mk(pos, ovr, pot, rarity, age, youth) {
    let best = null, bd = 99;
    for (let v = 1; v <= 10; v += 0.02) {
      const p = DS.makePlayer({ pos: pos, s: v, t: v, p: v, rarity: rarity, age: age, trait: 'diligent', lock: 'fight' });
      const r = DS.ratingOf(p), d = Math.abs(r - ovr);
      if (d < bd) { bd = d; best = p; }
      if (r === ovr) { break; }
    }
    best.pot = pot;
    if (youth) { best.youth = true; best.originYouth = true; }
    best.age = age;
    return best;
  }
  function trainOnce(p) {
    /* v39 doTrain() 과 같은 효과: 레벨 +1 없이 훈련 EXP(다음 레벨의 45%) + 메뉴 2개(각 +1) */
    if (DS.atPotCap(p)) { return; }
    DS.addExp(p, DS.trainExpGain(p), null, 'first');
    const gain = { s: 1, t: 1 };
    const tm = DS.trainMultOf(p);
    if (tm > 1 && Math.random() < tm - 1) { gain.t += 1; }
    const k = DS.TRAIN_GAIN_K;
    DS.applyGain(p, 's', gain.s * k);
    DS.applyGain(p, 't', gain.t * k);
  }
  function run(opts) {
    const p = mk(opts.pos, opts.ovr, opts.pot, opts.rarity, opts.age, opts.youth);
    const start = DS.ratingOf(p);
    const log = [];
    let capRound = null;
    for (let r = 1; r <= 76; r++) {
      if (opts.youth) {
        const c = DS.matchExpGain(p, { rating: 6.0, goals: 0, assists: 0, base: 70,
          kindMult: DS.RESERVE_KIND_MULT, mgr: null });
        DS.addExp(p, Math.max(1, Math.round(c.exp * 1.15)), null, 'reserve');
      } else {
        const c = DS.matchExpGain(p, { rating: 6.3, goals: 0, assists: 0, base: 70,
          kindMult: 1, mgr: null });
        DS.addExp(p, c.exp, null, 'first');
      }
      if (r % 4 === 0) { trainOnce(p); }
      if (capRound === null && DS.rawRating(p) >= DS.potOf(p)) { capRound = r; }
      if (r === 38 || r === 76) { log.push({ r: r, ovr: DS.ratingOf(p), lv: p.level, dev: p.dev || 0, expLeft: Math.round(p.exp || 0) }); }
    }
    return { tag: opts.tag, start: start, pot: DS.potOf(p), capRound: capRound,
             at38: log[0], at76: log[1], s: p.s, t: p.t, pw: p.p };
  }
  const out = [];
  out.push(run({ tag: '1군 동(58/70)', pos: 'CM', ovr: 58, pot: 70, rarity: 'dong', age: 23 }));
  out.push(run({ tag: '1군 은(64/74)', pos: 'CM', ovr: 64, pot: 74, rarity: 'eun', age: 25 }));
  out.push(run({ tag: '1군 금(70/80)', pos: 'ST', ovr: 70, pot: 80, rarity: 'geum', age: 26 }));
  /* v39 — 유소년 배율은 21세까지: 22세 유망주는 일반 선수와 같은 속도 */
  out.push(run({ tag: '유소년출신 22세(58/76)', pos: 'CM', ovr: 58, pot: 76, rarity: 'eun', age: 22, youth: true }));
  const y = [];
  for (let i = 0; i < 12; i++) {
    y.push(run({ tag: '유소년' + (i + 1), pos: 'CM', ovr: 58, pot: 76, rarity: 'eun', age: 16, youth: true }));
  }
  const avg = (k) => Math.round(y.reduce((a, b) => a + b[k], 0) / y.length * 10) / 10;
  return {
    adult: out, youth: y,
    youthAvg: { at38: avg('at38'), at76: avg('at76') },
    youthOvrs38: y.map((x) => x.at38.ovr), youthOvrs76: y.map((x) => x.at76.ovr),
    youthCap: y.map((x) => x.capRound), expToNext: [DS.expToNext(0), DS.expToNext(5), DS.expToNext(10)]
  };
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
        res = pg.evaluate(JS)
        res['errs'] = errs[:5]
        print(json.dumps(res, ensure_ascii=False, indent=1))
        b.close()
finally:
    srv.terminate()
