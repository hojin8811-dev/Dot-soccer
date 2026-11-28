#!/usr/bin/env python3
"""v39b 성장 페이스 — 시즌(38R) 단위로 나이·유소년 배율·훈련을 함께 굴려 잠재 도달 시점을 계측한다.

사용:
  python3 scripts/v39b_pace.py                    # 현재 코드 값 그대로 (v39b 결과표)
  python3 scripts/v39b_pace.py --cfg '{"A":2040,"B":1560,"TES":0.18}'   # 상수 덮어쓰기
  python3 scripts/v39b_pace.py --sweep            # 후보 상수 격자 탐색

계측 시나리오
  · 유소년 16세 58/76 (동·표준) — 2군 2시즌 → 1군 주전, 21세까지 유소년 배율
  · 유소년 16세 60/85 (은) · 62/90 (금·레전드)
  · 유소년 16세 58/80 (대표 표본) — 1군 주전으로 바로
  · 일반 22세 58/70 · 22세 64/78 · 24세 70/85 — 유소년 배율 없음
  훈련은 '시즌당 N회'(0/10/19)로 나눠 본다. 1시즌 = 38R.
"""
import json, os, subprocess, sys, time

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/pw-browsers')
os.environ['LD_LIBRARY_PATH'] = '/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu' + (
    ':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
from playwright.sync_api import sync_playwright

ROOT = '/workspace/dot-soccer-v18'
CHROME = '/workspace/.cache/pw-browsers/chromium-1255/chrome-linux64/chrome'
PORT = int(os.environ.get('PORT', '8162'))
B = os.environ.get('BUILD', '40')
URL = f'http://127.0.0.1:{PORT}/index.html?v=39&b={B}'

JS = r"""
(configs) => {
  function applyCfg(c) {
    if (!c) { return; }
    var A = c.A, Bv = c.B;
    if (A != null || Bv != null) {
      var a = A != null ? A : 1020, b = Bv != null ? Bv : 780;
      DS.expToNext = function (level) { return a + (level || 0) * b; };
    }
    if (c.LG != null) { DS.LEVEL_GAIN = c.LG; }
    if (c.RLG != null) { DS.RESERVE_LEVEL_GAIN = c.RLG; }
    if (c.TGK != null) { DS.TRAIN_GAIN_K = c.TGK; }
    if (c.TES != null) { DS.TRAIN_EXP_SHARE = c.TES; }
    if (c.YM != null) { DS.YOUTH_EXP_MULT = c.YM; }
    if (c.BLOOM != null) { DS.AGE_STAGES[0].expMult = c.BLOOM; }
    if (c.RKM != null) { DS.RESERVE_KIND_MULT = c.RKM; }
  }
  function mk(pos, ovr, pot, rarity, age, youth) {
    var best = null, bd = 99;
    for (var v = 1; v <= 10; v += 0.02) {
      var p = DS.makePlayer({ pos: pos, s: v, t: v, p: v, rarity: rarity, age: age, trait: 'diligent', lock: 'fight' });
      var r = DS.ratingOf(p), d = Math.abs(r - ovr);
      if (d < bd) { bd = d; best = p; }
      if (r === ovr) { break; }
    }
    best.pot = pot;
    if (youth) { best.youth = true; best.originYouth = true; }
    best.age = age;
    return best;
  }
  /* v39b doTrain() 과 같은 효과 */
  function trainOnce(p, mgr, mode) {
    if (DS.atPotCap(p)) { return; }
    var e = DS.trainExpGain(p);
    if (e) { DS.addExp(p, e, mgr, mode); }
    var gain = { s: 1, t: 1 };
    var tm = DS.trainMultOf(p);
    if (tm > 1 && Math.random() < tm - 1) { gain.t += 1; }
    var k = DS.TRAIN_GAIN_K;
    DS.applyGain(p, 's', gain.s * k);
    DS.applyGain(p, 't', gain.t * k);
  }
  var MGR = DS.managerOf('m01');
  var REPS = 10;
  var SEASONS = 8, ROUNDS = 38;
  function sim(cfg, spec) {
    applyCfg(cfg);
    var p = mk(spec.pos, spec.ovr, spec.pot, spec.rarity, spec.age, spec.youth);
    var capRound = null, capSeason = null, capAge = null;
    var end = [];
    var perSeasonTrain = spec.train || 0;
    var trainEvery = perSeasonTrain > 0 ? Math.max(1, Math.round(ROUNDS / perSeasonTrain)) : 0;
    for (var s = 1; s <= SEASONS; s++) {
      for (var r = 1; r <= ROUNDS; r++) {
        var round = (s - 1) * ROUNDS + r;
        var academy = spec.youth && s <= (spec.academy || 0);
        var o;
        if (academy) {
          var rating = 6.05 + (Math.random() - 0.5) * 1.2;
          o = DS.matchExpGain(p, { rating: rating, goals: 0, assists: 0, base: 70,
            kindMult: DS.RESERVE_KIND_MULT, mgr: MGR });
          DS.addExp(p, Math.max(1, Math.round(o.exp * 1.15)), MGR, 'reserve');
        } else {
          var rt = (spec.rating || 6.6) + (Math.random() - 0.5) * 0.7;
          o = DS.matchExpGain(p, { rating: rt, goals: Math.random() < 0.3 ? 1 : 0,
            assists: Math.random() < 0.2 ? 1 : 0, base: 70, kindMult: spec.kind || 1, mgr: MGR });
          DS.addExp(p, o.exp, MGR, 'first');
        }
        if (capRound === null && DS.rawRating(p) >= DS.potOf(p)) { capRound = round; capSeason = s; capAge = p.age; }
        if (trainEvery && r % trainEvery === 0 && !DS.atPotCap(p)) { trainOnce(p, MGR, academy ? 'reserve' : 'first'); }
        if (capRound === null && DS.rawRating(p) >= DS.potOf(p)) { capRound = round; capSeason = s; capAge = p.age; }
      }
      p.age = p.age + 1;
      end.push({ s: s, age: p.age, ovr: DS.ratingOf(p), lv: p.level });
    }
    return { tag: spec.tag, start: spec.ovr, pot: spec.pot, capRound: capRound, capSeason: capSeason,
      capAge: capAge, end: end };
  }
  function avg(list) {
    var acc = null, i, j;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!acc) { acc = { tag: r.tag, start: r.start, pot: r.pot, caps: [], ovr: [], lv: [] }; }
      acc.caps.push(r.capRound === null ? 9999 : r.capRound);
      for (j = 0; j < r.end.length; j++) {
        if (!acc.ovr[j]) { acc.ovr[j] = []; acc.lv[j] = []; }
        acc.ovr[j].push(r.end[j].ovr);
        acc.lv[j].push(r.end[j].lv);
      }
    }
    var mean = function (a) { var t = 0; for (var k = 0; k < a.length; k++) { t += a[k]; } return Math.round(t / a.length * 10) / 10; };
    var caps = acc.caps.filter(function (x) { return x < 9999; });
    return { tag: acc.tag, start: acc.start, pot: acc.pot,
      capRound: caps.length ? Math.round(caps.reduce(function (a, b) { return a + b; }, 0) / caps.length) : null,
      capRate: Math.round(caps.length / acc.caps.length * 100),
      seasonOvr: acc.ovr.map(mean), seasonLv: acc.lv.map(mean) };
  }
  SCEN.forEach(function () {});
  var out = configs.map(function (c) {
    var runs = {};
    SPECS.forEach(function (sp) {
      var key = sp.tag;
      runs[key] = runs[key] || [];
      for (var i = 0; i < (sp.reps || REPS); i++) { runs[key].push(sim(c, sp)); }
    });
    var res = {};
    Object.keys(runs).forEach(function (k) { res[k] = avg(runs[k]); });
    return { cfg: c, res: res };
  });
  return out;
}
"""

# 시나리오 — 1시즌 38R
SPECS = [
    # 대표 유소년 (아카데미 2시즌 → 1군 주전)
    dict(tag='유소년16 58/76 아카2→주전', pos='CM', ovr=58, pot=76, rarity='dong', age=16, youth=True, academy=2, rating=6.6, train=10),
    # 등급 대표
    dict(tag='유소년16 60/85 아카2→주전', pos='CM', ovr=60, pot=85, rarity='eun', age=16, youth=True, academy=2, rating=6.6, train=10),
    dict(tag='유소년16 62/90 아카2→주전', pos='ST', ovr=62, pot=90, rarity='legend', age=16, youth=True, academy=2, rating=6.6, train=10),
    dict(tag='유소년16 60/85 아카4→주전', pos='CM', ovr=60, pot=85, rarity='eun', age=16, youth=True, academy=4, rating=6.6, train=10),
    dict(tag='유소년16 60/85 아카5→주전', pos='CM', ovr=60, pot=85, rarity='eun', age=16, youth=True, academy=5, rating=6.6, train=10),
    dict(tag='유소년16 62/90 CM 아카2→주전', pos='CM', ovr=62, pot=90, rarity='legend', age=16, youth=True, academy=2, rating=6.6, train=10),
    dict(tag='유소년16 58/85 CM 아카2→주전', pos='CM', ovr=58, pot=85, rarity='eun', age=16, youth=True, academy=2, rating=6.6, train=10),
    dict(tag='유소년16 58/80 CM 아카2→주전', pos='CM', ovr=58, pot=80, rarity='eun', age=16, youth=True, academy=2, rating=6.6, train=10),
    # 대표 표본: 바로 1군 주전
    dict(tag='유소년16 58/80 1군주전', pos='CM', ovr=58, pot=80, rarity='dong', age=16, youth=True, academy=0, rating=6.6, train=10),
    # 훈련 강도별
    dict(tag='유소년16 58/76 훈련0', pos='CM', ovr=58, pot=76, rarity='dong', age=16, youth=True, academy=2, rating=6.6, train=0),
    dict(tag='유소년16 58/76 훈련19', pos='CM', ovr=58, pot=76, rarity='dong', age=16, youth=True, academy=2, rating=6.6, train=19),
    # 일반 선수 (22~24세, 유소년 배율 없음)
    dict(tag='일반22 58/70 훈련10', pos='CM', ovr=58, pot=70, rarity='dong', age=22, youth=False, academy=0, rating=6.6, train=10),
    dict(tag='일반22 64/78 훈련10', pos='CM', ovr=64, pot=78, rarity='eun', age=22, youth=False, academy=0, rating=6.6, train=10),
    dict(tag='일반24 70/85 훈련10', pos='ST', ovr=70, pot=85, rarity='geum', age=24, youth=False, academy=0, rating=6.6, train=10),
    dict(tag='일반22 58/70 훈련0', pos='CM', ovr=58, pot=70, rarity='dong', age=22, youth=False, academy=0, rating=6.6, train=0),
]

GRID = [
    dict(),
    dict(A=2040, B=1560),
    dict(A=2040, B=1560, TES=0.20),
    dict(A=2040, B=1560, TES=0.20, TGK=0.04),
    dict(A=2800, B=2100, TES=0.18, TGK=0.04),
    dict(A=2800, B=2100, TES=0.15, TGK=0.04, RLG=0.16),
    dict(A=3400, B=2600, TES=0.14, TGK=0.035, RLG=0.14),
    dict(A=4200, B=3200, TES=0.12, TGK=0.03, RLG=0.12, LG=0.06),
]


def run(configs):
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
            pg.wait_for_timeout(1200)
            pg.evaluate("(specs) => { window.SPECS = specs; }", SPECS)
            # SPECS/SCEN 을 페이지에 심는다
            js = JS.replace("SCEN.forEach(function () {});", "")
            res = pg.evaluate("(args) => { window.SPECS = args.specs; return (" + js + ")(args.configs); }",
                              {"specs": SPECS, "configs": configs})
            return res, errs[:3]
    finally:
        srv.terminate()


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--grid' in args:
        configs = json.load(open(args[args.index('--grid') + 1]))
    elif '--sweep' in args:
        configs = GRID
    elif '--cfg' in args:
        configs = [json.loads(args[args.index('--cfg') + 1])]
    else:
        configs = [dict()]
    out, errs = run(configs)
    for blk in out:
        print('=' * 78)
        print('CFG', json.dumps(blk['cfg'], ensure_ascii=False))
        for tag, r in blk['res'].items():
            caps = r['capRound']
            print('  %-26s %2d/%2d → 잠재 %s (R%s, %s시즌, %s%% 도달) | 시즌말 OVR %s' % (
                tag, r['start'], r['pot'],
                ('%sR' % caps) if caps else '미도달',
                caps, round(caps / 38, 1) if caps else '-', r['capRate'],
                '/'.join(str(int(x)) for x in r['seasonOvr'])))
    print('errs', errs)
