/*! 도트싸커 v16 — 진짜 축구 AI · 실시간 경기 엔진 (match.js)
    v16: 전 프레임 Hard Separation(겹침 0) · 박스 타겟 슬롯 분산 · GK 보호 · 수비 복귀 */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var rnd = U.rnd, range = U.range, chance = U.chance, clamp = U.clamp, pick = U.pick;

  var WORLD_W = 100;
  var WORLD_H = 120;
  var MATCH_SECONDS = 168;     /* v15 — ×1 배속에서 168초(2분 48초)에 90분 경기: 패스·침투·세트피스를 지켜보는 호흡 */
  var PER_MIN = MATCH_SECONDS / 90;   /* 경기 1분에 해당하는 시뮬레이션 초 (≈1.87초) */
  var MAX_SUBS = 5;
  var HAND_SIZE = 3;
  var CARD_LIMIT = 6;          /* 경기당 전술 카드 개입 최대 횟수 */

  var M = {
    running: false,
    paused: false,
    speed: 1,
    phase: 'idle',
    clock: 0,
    homeScore: 0,
    awayScore: 0,
    subsLeft: MAX_SUBS
  };

  var canvas = null;
  var ctx = null;
  var W = 390, H = 430, dpr = 1;
  var field = { x: 6, y: 6, w: 378, h: 418 };
  var SPR_H = 28;            /* 피치 선수 스프라이트 높이(px) — v8: v7의 절반 */
  var BALL_G = 150;          /* 공 중력(월드 단위/s^2) */
  var pitchLayer = null;

  var players = [];
  var cfg = null;
  var ratings = [];
  var benchState = [];
  var lastT = 0;
  var rafId = 0;
  var acc = 0;
  var simTime = 0;
  var actionTimer = 0;
  var fillerTimer = 0;
  var halftimeDone = false;
  var tactic = 'balanced';
  var goalStats = { homeShots: 0, awayShots: 0 };
  var stats = { passes: 0, tackles: 0, saves: 0, interceptions: 0 };
  var spriteCache = {};
  var lastScorerSide = 'home';
  var goals = [];
  var cautions = [];
  var possession = { home: 0.001, away: 0.001 };
  var halfScore = [[0, 0], [0, 0]];
  var formFactor = 1;

  /* ── v15 — 추가시간 · 세트피스 · 오프사이드 계측 ── */
  var addedTime = { first: 0, second: 0 };      /* 45+N · 90+N 의 N */
  var addedDecided = { first: false, second: false };
  var deadTime = 0;                             /* 현재 하프에서 소비된 지연 시간(시뮬 초) */
  var v15 = null;
  function blankV15() {
    return {
      offside: { home: 0, away: 0 },
      setpiece: { throw: 0, goalkick: 0, corner: 0, fk: 0, pk: 0, indirect: 0 },
      reds: 0, cards: 0, added: [0, 0], timeline: []
    };
  }
  function dead(sec) { deadTime += sec; }
  function logEvt(kind, side, x, y) {
    if (!v15) { return; }
    v15.timeline.push({ t: Math.round(minute()), kind: kind, side: side || null, x: Math.round(x || 0), y: Math.round(y || 0) });
    if (v15.timeline.length > 90) { v15.timeline.shift(); }
  }
  var flagShow = { t: 0, y: 0, side: null };    /* 부심 깃발 · 오프사이드 점선 라인 */
  var bannerT = 0;
  var homeXg = 0, awayXg = 0;

  /* ── 모멘텀 · 전술 카드 ── */
  var momentum = 0;
  var hand = [];
  var drawQueue = [];
  var buffs = {};
  var mgrFx = {};          /* 감독 특기 (경기 내내 고정) */
  var homeMetrics = null;  /* 감독 전술 보정이 반영된 우리 팀 포메이션 지표 */
  /* v14 — 감독 전술 철학 계측기 (검증·QA용) */
  var tele = null;
  function blankTele() {
    return {
      pass: { home: { short: 0, long: 0, through: 0, cross: 0, switch: 0 }, away: { short: 0, long: 0, through: 0, cross: 0, switch: 0 } },
      passDist: { home: { sum: 0, n: 0 }, away: { sum: 0, n: 0 } },
      press: { home: 0, away: 0 },           /* 태클 시도(압박 접촉) 횟수 */
      pressHigh: { home: 0, away: 0 },       /* 상대 진영에서 시작한 높은 압박 */
      pressY: { home: { sum: 0, n: 0 }, away: { sum: 0, n: 0 } },   /* 압박이 일어난 평균 높이 */
      swarm: { home: 0, away: 0 },           /* 볼 상실 직후 즉시 압박(카운터프레스) 가동 */
      longwin: { home: 0, away: 0 }         /* 자기 진영 탈취 직후 전방 롱패스 */
    };
  }
  tele = blankTele();
  var cutinHold = 0;
  var cardUses = 0;
  var lastHud = 0;
  var hudDirty = true;

  /* ── 볼 ── */
  var ball = {
    x: 50, y: 60, vx: 0, vy: 0, z: 0, vz: 0,
    carrier: null, from: null, receiver: null,
    kind: 'idle', flight: 0, dur: 0,
    aim: null, shot: null, trail: [], assist: null,
    lastTouch: null, offside: null, exempt: false
  };

  /* ── 경기 상황(전개 단계 · 세트피스) ── */
  var play = {
    phase: 'kickoff',
    timer: 0.9,
    atkSide: 'home',
    stage: 'build',
    stageT: 0,
    counterSide: null,
    counterT: 0,
    recoverSide: null,
    recoverT: 0,
    markT: 0,
    sitKey: '',
    setpiece: null,
    passLine: null,
    looseT: 0,
    supT: 0,
    runT: 1.5,
    supList: null
  };

  /* 전술 상황 배너 문구 */
  var SIT = {
    kickoff:   { label: '킥오프',       sub: '경기 시작',              tone: 'build' },
    build:     { label: '후방 빌드업',   sub: 'GK → CB → DM',           tone: 'build' },
    mid:       { label: '중원 전개',     sub: '패스로 간격 벌리기',      tone: 'mid' },
    wide:      { label: '측면 돌파 중',  sub: '오버래핑 · 크로스 준비',  tone: 'wide' },
    final:     { label: '슈팅 찬스!',    sub: '박스 안 1:1',            tone: 'hot' },
    counterAtk:{ label: '역습 찬스!',    sub: '빠르게 전진',            tone: 'hot' },
    counterDef:{ label: '역습 위기!',    sub: '수비 라인 즉시 복귀',     tone: 'danger' },
    corner:    { label: '코너킥',        sub: '박스로 크로스',          tone: 'set' },
    fk:        { label: '프리킥',        sub: '세트피스 기회',          tone: 'set' },
    offside:   { label: '오프사이드',     sub: '상대 간접 프리킥',       tone: 'set' },
    throw:     { label: '스로인',        sub: '터치라인에서 던집니다',   tone: 'set' },
    goalkick:  { label: '골킥',          sub: '골키퍼가 차서 재개',      tone: 'build' },
    pk:        { label: '페널티킥',       sub: '키커 vs 골키퍼',         tone: 'hot' },
    red:       { label: '퇴장',          sub: '수적 열세',              tone: 'danger' },
    press:     { label: '전방 압박',     sub: '볼 탈취 시도',           tone: 'press' },
    save:      { label: 'GK 선방',       sub: '슛을 막아냅니다',         tone: 'save' },
    goal:      { label: 'GOAL!',        sub: '골망을 흔듭니다',         tone: 'hot' }
  };

  /* ─────────────────────────  좌표 · 기본  ─────────────────────────
     시뮬레이션 좌표: y = 공격축(0 = 상대 골문, WORLD_H = 우리 골문), x = 폭(0 = 왼 터치라인).
     v7 화면은 가로 16:9 피치라서, 공격축을 화면 x(왼→오른쪽), 폭을 화면 y(먼쪽→가까운쪽)로 투영한다.
     → 홈팀은 화면 왼쪽 골대에서 오른쪽 골대로, 원정팀은 오른쪽에서 왼쪽으로 공격한다. */
  var PROJ = DS.Art.PROJ;  /* 먼 쪽 0.85배 ~ 가까운 쪽 1.12배 원근 스케일 포함 */
  var pitchImg = null;
  /* v10 — 몸통 제거, 원형 초상화 토큰 + 파랑/빨강 팀 링
     v14 — 원을 한 단계 더 축소(0.55 → 0.43): 잔디 공간·패스 레인이 넓게 보인다 */
  var TOKEN_R = 0.43;             /* 토큰 원 반지름 / SPR_H (지름 ≈ 0.86 × SPR_H) */
  var heads = {};                 /* pic 번호 → { img, ready } — 피치 원형 토큰 초상화 */
  var headLeft = 0;               /* 아직 안 끝난 두상 로드 수 — 입장 게이트 */
  var ripples = [];               /* 액션 타격감 — 바깥으로 퍼지는 원형 파동 */
  var shake = { t: 0, t0: 0.3, mag: 0 };   /* 슛·골·선방 순간 카메라 흔들림 */
  var flash = { t: 0, t0: 2.4, side: 'home', score: '0 : 0', name: '' };   /* 골 전광판 */
  var artGateOn = false;          /* 22명 초상화가 준비될 때까지 킥오프를 잠깐 미룬다 */
  var artGateT = 0;

  /* 월드 좌표 → 화면 좌표 (사다리꼴 원근 투영) */
  function scr(wx, wy) {
    var u = clamp((WORLD_H - wy) / WORLD_H, -0.03, 1.03);
    var v = clamp(wx / WORLD_W, 0, 1);
    var l = field.x + field.w * (PROJ.farL + (PROJ.nearL - PROJ.farL) * v);
    var r = field.x + field.w * (PROJ.farR + (PROJ.nearR - PROJ.farR) * v);
    var yy = field.y + field.h * (PROJ.farY + (PROJ.nearY - PROJ.farY) * (0.52 * v + 0.48 * v * v));
    return { x: l + u * (r - l), y: yy, v: v, s: PROJ.s0 + (PROJ.s1 - PROJ.s0) * v };
  }
  function depthPx(z) { return z * (field.h / WORLD_H) * 1.5; }

  /* ── 원형 토큰 초상화 (두상 PNG · 얼굴 중심 크롭) ── */
  function loadHead(p) {
    var n = (p && p.player && p.player.pic) ? p.player.pic : 1;
    var rec = heads[n];
    if (rec) { return rec; }
    rec = { img: new global.Image(), ready: false, fx: 0.5 };
    heads[n] = rec;
    headLeft++;
    rec.img.onload = function () {
      rec.ready = Math.max(rec.img.naturalWidth || 0, rec.img.width || 0) > 0;
      rec.fx = headFocusX(rec.img);
      headLeft--;
    };
    rec.img.onerror = function () { rec.ready = false; headLeft--; };
    rec.img.src = 'assets/portraits/head/p' + (n < 10 ? '0' + n : n) + '.png';
    return rec;
  }
  /* 두상 이미지의 '머리' 가로 중심을 알파로 찾는다 — 팔·몸통이 섞인 그림도 얼굴이 원 가운데 오도록.
     캔버스를 못 쓰는 환경(헤드리스 검증)에서는 0.5로 폴백한다. */
  function headFocusX(img) {
    try {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!iw || !ih) { return 0.5; }
      var c = global.document.createElement('canvas');
      var k = Math.min(1, 96 / iw);
      c.width = Math.max(8, Math.round(iw * k));
      c.height = Math.max(8, Math.round(ih * k));
      var g2 = c.getContext('2d');
      if (!g2) { return 0.5; }
      g2.drawImage(img, 0, 0, c.width, c.height);
      var data = g2.getImageData(0, 0, c.width, c.height).data;
      if (!data || !data.length) { return 0.5; }
      /* 위에서부터 알파가 처음 나타나는 줄 = 머리 꼭대기, 그 아래 머리카락 띠의 가로 무게중심 */
      var y, x, top = -1, sum = 0, wsum = 0, bandEnd;
      for (y = 0; y < c.height; y++) {
        for (x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 40) { top = y; break; }
        }
        if (top >= 0) { break; }
      }
      if (top < 0) { return 0.5; }
      bandEnd = Math.min(c.height, top + Math.max(3, Math.round(c.height * 0.22)));
      for (y = top; y < bandEnd; y++) {
        for (x = 0; x < c.width; x++) {
          var a = data[(y * c.width + x) * 4 + 3];
          if (a > 40) { sum += x * a; wsum += a; }
        }
      }
      if (wsum <= 0) { return 0.5; }
      return clamp((sum / wsum) / c.width, 0.2, 0.8);
    } catch (e) { return 0.5; }
  }
  /* 액션 타격감 — 토큰 바깥으로 퍼지는 원형 파동 */
  function fxRing(p, color, size) {
    if (!p) { return; }
    ripples.push({ x: p.x, y: p.y, t: 0, t0: 0.52, color: color || '#ffffff', k: size || 1 });
    if (ripples.length > 26) { ripples.shift(); }
  }
  function fxPop(p, dur) {
    if (!p) { return; }
    p.popT = Math.max(p.popT || 0, dur || 0.3);
    p.popT0 = p.popT;
  }
  /* 카메라 흔들림 — 세기와 시간 */
  function kickCam(mag, dur) {
    shake.mag = Math.max(shake.mag, mag);
    shake.t = Math.max(shake.t, dur || 0.24);
    shake.t0 = shake.t;
  }

  function goalDir(side) { return side === 'home' ? -1 : 1; }        /* 공격 방향 y */
  function ownGoalY(side) { return side === 'home' ? WORLD_H : 0; }
  function attackGoalY(side) { return side === 'home' ? 0 : WORLD_H; }
  function progressOf(side, y) { return side === 'home' ? (WORLD_H - y) / WORLD_H : y / WORLD_H; }
  function short(n) { return n && n.length > 3 ? n.slice(1) : n; }
  /* ── 선수 모션 포즈 ── */
  function setPose(p, name, dur) {
    if (!p) { return; }
    if (p.pose === name && p.poseT > dur * 0.5) { return; }
    p.pose = name;
    p.poseT = dur;
  }
  function poseOf(p) {
    if (isGK(p) && p.diveT > 0.05) { return 'dive'; }
    if (p.poseT > 0 && p.pose) { return p.pose; }
    if (ball.carrier === p) { return p.moving ? 'dribble' : 'idle'; }
    return p.moving ? 'run' : 'idle';
  }
  function d2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function isGK(p) { return p.pos === 'GK'; }
  function groupOf(p) { return DS.posGroup(p.pos); }
  function isDefGroup(p) { return groupOf(p) === 'DF'; }
  function isMidGroup(p) { return groupOf(p) === 'MF'; }
  function isFwdGroup(p) { return groupOf(p) === 'FW'; }

  function goalkeeper(side) {
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === side && isGK(players[i]) && !players[i].off) { return players[i]; }
    }
    return null;
  }
  function nearestOpponent(p, maxDist) {
    var best = null, bd = maxDist || 999, i, q, d;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return { player: best, dist: bd };
  }
  function nearestToBall(side, maxD) {
    var best = null, bd = maxD || 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== side || players[i].off) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    return best;
  }
  /* 화면 픽셀 기준 가장 가까운 상대 — 토큰 크기로 재야 '붙어 있다'가 맞는다 */
  function nearestOpponentPx(p, maxPx) {
    var best = null, bd = maxPx || 999, i, q, d;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === p.side || q.off) { continue; }
      d = pxDist(q.x, q.y, p.x, p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return { player: best, dist: bd };
  }
  function tacklePx() { return 2 * SPR_H * TOKEN_R * 1.30; }
  function defLineY(side) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === side && isDefGroup(p) && !p.off) { sum += p.y; n++; }
    }
    return n ? sum / n : (side === 'home' ? 100 : 20);
  }

  /* ── 전술 형태 (v10) ──
     수비 = 두 줄 수비 블록(DF·MF 간격 9~10, 폭 축소, 라인 하강)
     공격 = 라인 상승 · 풀백/윙백 오버래핑 · 2선 침투 · 침투 러닝 2명 동시 · 높은 압박
     → 같은 포메이션이라도 전술을 바꾸면 피치 위 대형이 눈에 띄게 달라진다. */
  function shapeOf(side) {
    var t = side === 'home' ? tactic : 'balanced';
    if (t === 'defense') {
      return { name: 'defense', bank: 9.4, bankW: 0.80, width: 0.84, press: -12, runs: 1, runMin: 3.0, runMax: 5.6, fbPush: 2, secondLine: 0 };
    }
    if (t === 'attack') {
      return { name: 'attack', bank: 16.2, bankW: 0.22, width: 1.10, press: 12, runs: 2, runMin: 1.1, runMax: 2.5, fbPush: 16, secondLine: 1 };
    }
    return { name: 'balanced', bank: 12.6, bankW: 0.42, width: 1.0, press: 0, runs: 1, runMin: 2.0, runMax: 4.2, fbPush: 8, secondLine: 0.45 };
  }
  /* 두 줄 블록의 기준선 — 수비 라인 바로 앞에 중원 라인을 세운다 */
  function bankYOf(side, group) {
    var sh = shapeOf(side);
    var df = lineYOf(side);
    var dir = goalDir(side);            /* 공격 방향 */
    /* v14 — 감독 전술: 더블 볼란테·역습형은 두 줄 간격을 좁혀 컴팩트 블록 */
    var bank = Math.max(6.4, sh.bank + (styleOf(side).blockBank - 12.6));
    if (group === 'MF') { return df + dir * bank; }
    if (group === 'FW') { return df + dir * (bank * 2.05 + (styleOf(side).fwStay || 0)); }
    return df;
  }

  /* ── 팀 형태: 포메이션 지표 + 전술 + 카드가 실제 라인·압박·폭을 바꾼다 ── */
  function formationOf(side) {
    return side === 'home' ? ((cfg && cfg.homeFormation) || '4-2-3-1')
      : ((cfg && cfg.awayFormation) || '4-4-2');
  }
  function metricsOf(side) {
    if (side === 'home' && homeMetrics) { return homeMetrics; }
    var f = DS.FORMATIONS[formationOf(side)];
    return (f && f.metrics) || { press: 70, line: 65, width: 70, tempo: 70 };
  }
  function buildHomeMetrics(key) {
    var f = DS.FORMATIONS[key] || DS.FORMATIONS['4-2-3-1'];
    var m = f.metrics;
    var t = DS.managerTune ? DS.managerTune(mgrFx) : { press: 0, line: 0, width: 0, tempo: 0 };
    homeMetrics = {
      press: clamp(m.press + t.press, 20, 99),
      line: clamp(m.line + t.line, 20, 99),
      width: clamp(m.width + t.width, 20, 99),
      tempo: clamp(m.tempo + t.tempo, 20, 99)
    };
    return homeMetrics;
  }
  /* ── v14 감독 전술 철학: 감독마다 피치 위 움직임이 실제로 달라진다 ── */
  function styleKeyOf(side) {
    return (side === 'home' ? (cfg && cfg.homeTacticStyle) : (cfg && cfg.awayTacticStyle)) || 'balanced';
  }
  function styleOf(side) { return DS.tacticStyle(styleKeyOf(side)); }
  function morphOf(side) {
    var f = DS.FORMATIONS[formationOf(side)];
    return (f && f.morph) || null;
  }
  function dfBaseAvg(side) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === side && isDefGroup(p) && !p.off) { sum += p.baseY; n++; }
    }
    return n ? sum / n : (side === 'home' ? 100 : 20);
  }
  /* 그 팀 수비 라인의 월드 y — 포메이션 line 지표 · 전술 · 카드에 따라 달라진다 */
  function lineYOf(side) {
    var m = metricsOf(side);
    var stl = styleOf(side);
    var depth = 12 + m.line * 0.44 + stl.line;
    var t = side === 'home' ? tactic : 'balanced';
    if (t === 'attack') { depth += 10; }
    else if (t === 'defense') { depth -= 12; }
    if (side === 'home' && buffOf('offside') > 0) { depth += 6; }
    if (side === 'home' && buffOf('press') > 0) { depth += 5; }
    if (side === 'home' && buffOf('def') > 0) { depth -= 6; }
    if (play.counterT > 0 && play.counterSide !== side) { depth -= 6; }
    if (play.recoverT > 0 && play.recoverSide === side) { depth -= 4; }
    depth = clamp(depth, 7, 56);
    return ownGoalY(side) + (side === 'home' ? -depth : depth);
  }
  function blockShift(side) { return lineYOf(side) - dfBaseAvg(side); }
  function anchorOf(p) {
    var w = isDefGroup(p) ? 1 : (isMidGroup(p) ? 0.86 : 0.72);
    var ax = p.baseX;
    var ay = p.baseY + blockShift(p.side) * w;
    /* v14 변칙 포메이션 — 공격 중에는 기본 대형 자체가 변한다 */
    var mo = morphOf(p.side);
    if (mo && ball.carrier && ball.carrier.side === p.side) {
      var dirM = goalDir(p.side);
      if (mo.boxMid > 0 && p.pos === 'DM') {
        ax = 50 + (ax - 50) * (1 - 0.55 * mo.boxMid);
        ay -= dirM * 4.5 * mo.boxMid;
      }
      if (mo.wbUp > 0 && (p.pos === 'LWB' || p.pos === 'RWB')) {
        ay -= dirM * 10 * mo.wbUp;
      }
      if (mo.wingHigh > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        ay -= dirM * 4;
      }
      if (mo.fbIn > 0 && (p.pos === 'LB' || p.pos === 'RB')) {
        ax = 50 + (ax - 50) * (1 - 0.28 * mo.fbIn);
      }
    }
    return { x: ax, y: ay };
  }
  /* 압박 인원 · 반경 — press 지표와 게겐프레싱 카드로 확대 */
  function pressConfig(side) {
    var m = metricsOf(side);
    var stl = styleOf(side);
    var press = m.press + stl.press;
    if (side === 'home') {
      press += shapeOf('home').press;
      if (buffOf('press') > 0) { press += 26; }
      press += mfx('press') * 1.2;
    }
    var n = press >= 80 ? 3 : (press >= 60 ? 2 : 1);
    if (side === 'home' && shapeOf('home').name === 'attack' && n < 3) { n = 3; }
    if (side === 'home' && buffOf('press') > 0) { n = 4; }
    return { n: n, radius: 9 + press * 0.16, press: press };
  }

  /* ─────────────────────────  포지션 구역 · 생성  ───────────────────────── */
  function zoneFor(pos, by, side) {
    var d = side === 'home' ? -1 : 1;
    var fwd = 8, back = 8, xl = 6, xr = 94;
    if (pos === 'GK') { fwd = 5; back = 2; xl = 38; xr = 62; }
    else if (pos === 'CB') { fwd = 11; back = 8; xl = 12; xr = 88; }
    else if (pos === 'LB') { fwd = 17; back = 9; xl = 2; xr = 46; }
    else if (pos === 'RB') { fwd = 17; back = 9; xl = 54; xr = 98; }
    else if (pos === 'LWB') { fwd = 27; back = 12; xl = 2; xr = 40; }
    else if (pos === 'RWB') { fwd = 27; back = 12; xl = 60; xr = 98; }
    else if (pos === 'DM') { fwd = 15; back = 10; xl = 22; xr = 78; }
    else if (pos === 'CM') { fwd = 19; back = 13; xl = 10; xr = 90; }
    else if (pos === 'AM') { fwd = 21; back = 14; xl = 14; xr = 86; }
    else if (pos === 'LWF') { fwd = 23; back = 10; xl = 2; xr = 42; }
    else if (pos === 'RWF') { fwd = 23; back = 10; xl = 58; xr = 98; }
    else { fwd = 21; back = 11; xl = 24; xr = 76; }
    var yMin = d < 0 ? by - fwd : by - back;
    var yMax = d < 0 ? by + back : by + fwd;
    return {
      yMin: clamp(yMin, 3, WORLD_H - 3), yMax: clamp(yMax, 3, WORLD_H - 3),
      xMin: xl, xMax: xr, fwd: fwd, back: back, dir: d
    };
  }

  /* v16 — 기본 위치(포메이션 슬롯)가 미러링으로 겹치면 두 선수가 영원히 한 점에서 싸운다.
     킥오프 직전에 기본 좌표만 한 번 떼어 놓도로 민다 (경기 중 위치는 그대로 둔다). */
  function relaxBases() {
    var i, j, a, b, dx, dy, rt, sx, sy, dpx, minPx, push, ux, uy, sa, sb, pass;
    for (pass = 0; pass < 6; pass++) {
      for (i = 0; i < players.length; i++) {
        a = players[i];
        for (j = i + 1; j < players.length; j++) {
          b = players[j];
          dx = b.baseX - a.baseX; dy = b.baseY - a.baseY;
          rt = sepRates(clamp((a.baseX + b.baseX) / 2 / WORLD_W, 0, 1));
          sx = -dy * rt.ky; sy = dx * rt.kx;
          dpx = Math.hypot(sx, sy);
          sa = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(a.baseX / WORLD_W, 0, 1);
          sb = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(b.baseX / WORLD_W, 0, 1);
          minPx = 2 * SPR_H * TOKEN_R * (sa + sb) / 2 * SEP_K;
          if (dpx < 0.0001) {
            dx = 0.45 * (i % 2 ? 1 : -1); dy = 0.7 * (j % 2 ? 1 : -1);
            sx = -dy * rt.ky; sy = dx * rt.kx; dpx = Math.hypot(sx, sy);
          }
          if (dpx < minPx) {
            push = (minPx - dpx) * 0.5;
            ux = sx / dpx; uy = sy / dpx;
            a.baseX = clamp(a.baseX - (uy * push) / rt.kx, 3, WORLD_W - 3);
            a.baseY = clamp(a.baseY + (ux * push) / rt.ky, 3, WORLD_H - 3);
            b.baseX = clamp(b.baseX + (uy * push) / rt.kx, 3, WORLD_W - 3);
            b.baseY = clamp(b.baseY - (ux * push) / rt.ky, 3, WORLD_H - 3);
          }
        }
      }
    }
    for (i = 0; i < players.length; i++) {
      players[i].homeX = players[i].baseX;
      players[i].homeY = players[i].baseY;
    }
  }

  function mkPlayer(side, player, kit, role, pos, x, y) {
    var bx = side === 'home' ? x : 100 - x;
    var by = side === 'home' ? y * 1.2 : WORLD_H - y * 1.2;
    return {
      side: side, player: player, kit: kit, role: role, pos: pos,
      baseX: bx, baseY: by, x: bx, y: by, tx: bx, ty: by,
      vx: 0, vy: 0, phase: Math.random() * 4, frame: 0,
      pose: null, poseT: 0, lean: 0, speed: 0,
      facing: side === 'home' ? 1 : -1, diveT: 0, diveDir: 1, stun: 0,
      goals: 0, assists: 0, yellows: 0, name: player.name, off: false,
      moving: false, glow: 0, skillT: 0, bubble: null, throughRun: null,
      popT: 0, popT0: 0.3,
      support: null, runTo: null, runT: 0, supportT: 0,
      mark: null, zone: zoneFor(pos, by, side), homeX: bx, homeY: by,
      boxSlot: null, stam: 100, kind: 'keep'
    };
  }

  function makeHomePlayers(lineup) {
    var out = [], i;
    for (i = 0; i < lineup.length; i++) {
      var s = lineup[i];
      out.push(mkPlayer('home', s.player, cfg.homeKit, s.role, s.pos, s.x, s.y));
    }
    return out;
  }
  function makeAwayPlayers(list, formationKey) {
    var f = DS.FORMATIONS[formationKey] || DS.FORMATIONS['4-4-2'];
    var slots = f.slots, out = [], i, s;
    for (i = 0; i < list.length; i++) {
      s = slots[i] || { role: 'ST', pos: 'ST', x: 50, y: 40 };
      out.push(mkPlayer('away', list[i], cfg.awayKit, s.role, s.pos, s.x, s.y));
    }
    return out;
  }

  function initRatings() {
    ratings = [];
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== 'home') { continue; }
      ratings.push({
        id: players[i].player.id, name: players[i].name, role: players[i].role,
        pos: players[i].pos, goals: 0, assists: 0, rating: 6.0, mvp: false
      });
    }
  }
  function ratingOf(p) {
    var i;
    for (i = 0; i < ratings.length; i++) { if (ratings[i].id === p.player.id) { return ratings[i]; } }
    return null;
  }
  function addRating(p, delta) {
    var r = ratingOf(p);
    if (r) { r.rating = clamp(r.rating + delta, 3.5, 10); }
  }
  function minute() { return Math.min(90, Math.floor(simTime / MATCH_SECONDS * 90)); }

  /* ─────────────────────────  모멘텀 · 카드  ───────────────────────── */
  function charge(v) {
    momentum = clamp(momentum + v, 0, 100);
    hudDirty = true;
  }
  function buffOf(fx) { return buffs[fx] || 0; }
  /* 감독 특기 수치 (없으면 0) */
  function mfx(k) { return mgrFx[k] || 0; }
  function anyAtkBuff() {
    return buffOf('atk') > 0 || buffOf('through') > 0 || buffOf('tiki') > 0 || buffOf('longshot') > 0;
  }

  function setupDeck(deck) {
    hand = [];
    drawQueue = [];
    buffs = {};
    momentum = 0;
    cardUses = 0;
    var list = (deck && deck.length ? deck : DS.DEFAULT_DECK).slice();
    list = U.shuffle(list);
    var i;
    for (i = 0; i < list.length; i++) {
      if (i < HAND_SIZE) { hand.push({ key: list[i], readyAt: 0 }); }
      else { drawQueue.push(list[i]); }
    }
    while (hand.length < HAND_SIZE && drawQueue.length) { hand.push({ key: drawQueue.shift(), readyAt: 0 }); }
  }

  function hudState() {
    var out = {
      momentum: Math.round(momentum), hand: [], buffs: [], uses: cardUses,
      usesLeft: Math.max(0, CARD_LIMIT - cardUses), limit: CARD_LIMIT
    };
    /* v9 — 실시간 미니 스탯 (점유율 · 슈팅 · 지친 선수) */
    var totP = possession.home + possession.away;
    var hPos = Math.round(possession.home / Math.max(0.001, totP) * 100);
    out.minute = minute();
    out.score = [M.homeScore, M.awayScore];
    out.poss = [hPos, 100 - hPos];
    out.shots = [goalStats.homeShots, goalStats.awayShots];
    out.tired = [];
    var j, q;
    for (j = 0; j < players.length; j++) {
      q = players[j];
      if (q.side !== 'home' || q.off) { continue; }
      if (q.stam <= 40) {
        out.tired.push({ name: short(q.name), pos: q.pos, stam: Math.round(q.stam) });
      }
    }
    out.tired.sort(function (a, b) { return a.stam - b.stam; });
    var i, def;
    for (i = 0; i < hand.length; i++) {
      def = DS.cardOf(hand[i].key);
      if (!def) { continue; }
      var ace = aceFor(def.fx);
      out.hand.push({
        key: def.key, name: def.name, cost: def.cost, tag: def.tag, color: def.color,
        icon: def.icon, ready: hand[i].readyAt <= 0 && momentum >= def.cost && cardUses < CARD_LIMIT,
        cooldown: Math.max(0, Math.ceil(hand[i].readyAt)),
        face: ace ? DS.Art.headSrc(ace.player) : '',
        ace: ace ? ace.name : '',
        desc: def.desc
      });
    }
    for (var k in buffs) {
      if (buffs.hasOwnProperty(k) && buffs[k] > 0) { out.buffs.push({ key: k, left: Math.ceil(buffs[k]) }); }
    }
    return out;
  }
  function pushHud() {
    hudDirty = false;
    if (cfg && cfg.onHud) { cfg.onHud(hudState()); }
  }

  function aceFor(fx) {
    var best = null, bv = -1, i, p, want, g, score;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || isGK(p)) { continue; }
      g = groupOf(p);
      want = (fx === 'atk' || fx === 'setpiece' || fx === 'through' || fx === 'longshot') ? 'FW'
        : (fx === 'press' || fx === 'tempo' || fx === 'build' || fx === 'tiki' || fx === 'roar' || fx === 'offside') ? 'MF'
        : (fx === 'def' || fx === 'trigger') ? 'MF' : null;
      score = DS.ratingOf(p.player) + (want === g ? 24 : 0);
      if (score > bv) { bv = score; best = p; }
    }
    return best;
  }

  function playCutin(def, ace) {
    cutinHold = 1.7;
    var host = document.getElementById('m-cutin');
    if (!host) { return; }
    var img = ace ? DS.Art.headSrc(ace.player) : '';
    host.innerHTML =
      '<div class="cutin" style="--cc:' + def.color + '">' +
      '<div class="cutin-lines"></div>' +
      '<div class="cutin-art">' + (img ? '<img src="' + img + '" alt="">' : '') + '</div>' +
      '<div class="cutin-body">' +
      '<div class="cutin-tag">MOMENTUM CARD · ' + def.tag + '</div>' +
      '<div class="cutin-name">' + def.name + '</div>' +
      '<div class="cutin-en">' + def.en + '</div>' +
      (ace ? '<div class="cutin-ace">' + ace.name + ' 발동</div>' : '') +
      '<div class="cutin-desc">' + def.desc + '</div>' +
      '</div></div>';
    host.classList.add('on');
    global.setTimeout(function () {
      if (host) { host.classList.remove('on'); host.innerHTML = ''; }
    }, 2400);
  }

  function goalCutin(scorer) {
    var host = document.getElementById('m-cutin');
    if (!host) { return; }
    var meta = DS.picMeta(scorer.player);
    host.innerHTML =
      '<div class="cutin gcutin" style="--cc:' + meta.color + '">' +
      '<div class="cutin-lines"></div>' +
      '<div class="cutin-art">' + DS.Art.portraitTag(scorer.player, '', 'full') + '</div>' +
      '<div class="cutin-body">' +
      '<div class="cutin-tag">GOAL · ' + minute() + "'</div>" +
      '<div class="gword">GOAL!</div>' +
      '<div class="cutin-ace">' + scorer.name + '</div>' +
      '<div class="cutin-desc">' + M.homeScore + ' : ' + M.awayScore + ' · ' + cfg.homeName + '</div>' +
      '</div></div>';
    host.classList.add('on');
    cutinHold = 1.15;
    global.setTimeout(function () {
      if (host) { host.classList.remove('on'); host.innerHTML = ''; }
    }, 1600);
  }

  M.playCard = function (key) {
    if (!M.running) { return false; }
    var idx = -1, i;
    for (i = 0; i < hand.length; i++) { if (hand[i].key === key) { idx = i; } }
    if (idx < 0) { return false; }
    var def = DS.cardOf(key);
    if (!def) { return false; }
    if (cardUses >= CARD_LIMIT) { return false; }
    if (hand[idx].readyAt > 0) { return false; }
    if (momentum < def.cost) { return false; }

    momentum = clamp(momentum - def.cost, 0, 100);
    cardUses++;
    applyCard(def);
    hand.splice(idx, 1);
    hand.push({ key: drawQueue.length ? drawQueue.shift() : key, readyAt: 9 });
    drawQueue.push(key);
    hudDirty = true;
    pushHud();
    return true;
  };

  function applyCard(def) {
    var fx = def.fx;
    buffs[fx] = Math.max(buffs[fx] || 0, def.dur);
    var ace = aceFor(fx);
    if (ace) { ace.glow = 2.4; addRating(ace, 0.12); }
    playCutin(def, ace);

    if (fx === 'setpiece') { setPieceCard(); }
    if (fx === 'trigger') { pressTrigger(); }
    if (fx === 'roar') { roar(); }
    if (fx === 'offside') { if (ace) { bubble(ace, '🚩 라인 올린다!', '#9fd8ff'); } }
    if (fx === 'longshot' && ace) { bubble(ace, '🔥 대포알 준비!', '#ffb066'); }
    if (fx === 'tiki' && ace) { bubble(ace, '👟 원투패스!', '#8ff0b6'); }
    if (fx === 'press' && ace) { bubble(ace, '🛡️ 압박!', '#ff9f8a'); }
    if (fx === 'atk' && ace) { bubble(ace, '🏃 하프스페이스!', '#c3a6ff'); }

    if (cfg.onCard) { cfg.onCard(def.key, ace ? ace.name : ''); }
    say('🎴 ' + def.name + ' 발동! ' + def.desc, 'tactic');
    hudDirty = true;
  }

  function setPieceCard() {
    var atk = play.atkSide || 'home';
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0; ball.trail = [];
    ball.x = 50 + range(-12, 12);
    ball.y = attackGoalY(atk) - goalDir(atk) * 26;
    freeKick(atk);
  }

  function pressTrigger() {
    var i, list = [], best = null, bv = -1;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'home' && !isGK(players[i])) {
        var v = players[i].player.stats.def + players[i].player.tough * 3;
        if (v > bv) { bv = v; best = players[i]; }
      }
    }
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'away' && !isGK(players[i]) && d2(players[i], ball) < 30) {
        players[i].stun = 0.85;
        list.push(players[i]);
      }
    }
    var target = ball.carrier;
    if (target && target.side === 'away' && best) {
      giveBall(best);
      addRating(best, 0.25);
      bubble(best, '🛡️ 압박!', '#ff9f8a');
      charge(3);
    }
    say('⚡ 압박 트리거! 상대 빌드업을 끊어냅니다.', 'tackle');
  }

  function offsideTrap() {
    /* 수비 라인을 즉시 전진시킨다 */
    var def = play.atkSide === 'home' ? 'away' : 'home';
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== def || isGK(p)) { continue; }
      p.y += (p.side === 'home' ? -5 : 5);
      p.ty = p.y;
    }
  }

  function roar() {
    momentum = clamp(momentum + 12, 0, 100);
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === 'home') { p.glow = Math.max(p.glow, 1.6); }
      else { p.stun = Math.max(p.stun, 0.3); }
    }
    say('📣 라커룸 일갈! 전 선수가 달아오릅니다. 모멘텀 +12', 'tactic');
    hudDirty = true;
  }

  /* ─────────────────────────  시작 · 종료  ───────────────────────── */
  M.start = function (config) {
    cfg = config;
    canvas = document.getElementById('m-pitch');
    if (!canvas) { return; }
    ctx = canvas.getContext('2d');
    players = makeHomePlayers(cfg.lineup).concat(makeAwayPlayers(cfg.awayPlayers, cfg.awayFormation));
    /* 2.5등신 일러스트 프리로드 — 피치 위 22명 전원 */
    var pi;
    for (pi = 0; pi < players.length; pi++) {
      loadHead(players[pi]);
    }
    benchState = (cfg.bench || []).map(function (b) {
      return { player: b.player, pos: b.player.pos, rating: DS.ratingOf(b.player), used: false };
    });
    initRatings();
    M.homeScore = 0; M.awayScore = 0; M.clock = 0;
    M.subsLeft = MAX_SUBS;
    M.paused = false;
    M.halftime = false;
    simTime = 0; acc = 0;
    goalStats = { homeShots: 0, awayShots: 0 };
    homeXg = 0; awayXg = 0;
    stats = { passes: 0, tackles: 0, saves: 0, interceptions: 0 };
    goals = []; cautions = [];
    tele = blankTele();
    v15 = blankV15();
    addedTime = { first: 0, second: 0 };
    addedDecided = { first: false, second: false };
    deadTime = 0;
    flagShow = { t: 0, y: 0, side: null };
    bannerT = 0;
    possession = { home: 0.001, away: 0.001 };
    halfScore = [[0, 0], [0, 0]];
    halftimeDone = false;
    tactic = cfg.tactics || 'balanced';
    mgrFx = cfg.managerFx || {};
    buildHomeMetrics(cfg.homeFormation);
    formFactor = 0.94 + clamp((cfg.condition || 80) / 900, 0, 0.12);
    spriteCache = {};
    ripples = [];
    setupDeck(cfg.deck);
    cutinHold = 0;
    play = {
      phase: 'kickoff', timer: 1.0, atkSide: 'home',
      stage: 'build', stageT: 0, counterSide: null, counterT: 0,
      recoverSide: null, recoverT: 0, markT: 0, sitKey: '',
      setpiece: null, passLine: null, looseT: 0, supT: 0, runT: 1.5, supList: null
    };
    ball = {
      x: 50, y: 60, vx: 0, vy: 0, z: 0, vz: 0, carrier: null, from: null, receiver: null,
      kind: 'idle', flight: 0, dur: 0, aim: null, shot: null, trail: [], assist: null,
      lastTouch: null, offside: null, exempt: false
    };
    updateScoreboard();
    clearCommentary();
    resize();
    relaxBases();
    resetKickoff(Math.random() < 0.5 ? 'home' : 'away');
    M.running = true;
    M.phase = 'play';
    lastT = 0;
    say('휘슬이 울립니다! ' + cfg.homeName + ' 대 ' + cfg.awayName + ', 경기 시작!', 'big');
    say('피치 위 상황 배너를 보고 전술 카드를 타이밍에 맞춰 쓰세요.', 'normal');
    pushHud();
    /* 선수단 입장 연출 — 2.5등신 일러스트가 준비되면 킥오프 */

    artGateOn = headLeft > 0;      /* v10 — 입장 게이트는 초상화 두상만 기다린다 (전신 프리로드 제거) */
    artGateT = 0;
    if (artGateOn) { M.paused = true; }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  };

  M.setSpeed = function (n) { M.speed = clamp(n, 1, 3); };
  M.setTactics = function (t) {
    tactic = t;
    var line = t === 'attack' ? '전술을 공격적으로! 라인을 끌어올립니다!' :
      (t === 'defense' ? '전술을 수비적으로! 라인을 내립니다.' : '균형 전술로 안정을 찾습니다.');
    say(line, 'tactic');
  };
  M.pause = function () { M.paused = true; };
  M.resume = function (quiet) {
    if (M.halftime) { deadTime = 0; }
    M.paused = false;
    M.halftime = false;
    lastT = 0;
    if (!quiet) { say('후반전 시작! 다시 공을 굴립니다.', 'big'); }
  };
  var autoCards = false;
  var autoT = 5;

  /* 자동 개입 — 모멘텀이 넉넉할 때 손패에서 가장 싼 카드를 알아서 쓴다 */
  function tryAutoCard() {
    if (!M.running || cardUses >= CARD_LIMIT) { return false; }
    if (cutinHold > 0 || play.phase === 'setpiece' || play.phase === 'goal') { return false; }
    var best = null, i, def;
    for (i = 0; i < hand.length; i++) {
      def = DS.cardOf(hand[i].key);
      if (!def || hand[i].readyAt > 0 || momentum < def.cost) { continue; }
      if (!best || def.cost < best.cost) { best = def; }
    }
    if (!best) { return false; }
    return M.playCard(best.key);
  }

  M.setAuto = function (on) {
    autoCards = !!on;
    autoT = 3;
    say(autoCards ? '자동 개입 ON — 상황에 맞춰 전술 카드를 알아서 씁니다.' : '자동 개입 OFF — 직접 카드를 고르세요.', 'tactic');
    return autoCards;
  };
  M.isAuto = function () { return autoCards; };

  M.handState = hudState;
  /* 진단용: 경기 상태 스냅샷 (디버깅 · QA리포트) */
  M.diag = function () {
    var c = ball.carrier;
    return {
      clock: Math.round(M.clock), phase: play.phase, stage: play.stage, kind: ball.kind,
      carrier: c ? c.name : null, carrierSide: c ? c.side : null,
      ballX: Math.round(ball.x * 10) / 10, ballY: Math.round(ball.y * 10) / 10,
      players: players.length,
      home: players.filter(function (p) { return p.side === 'home'; }).length,
      away: players.filter(function (p) { return p.side === 'away'; }).length,
      passes: stats.passes, shots: goalStats.homeShots + goalStats.awayShots,
      counterT: Math.round(play.counterT * 10) / 10, recoverT: Math.round(play.recoverT * 10) / 10,
      setpiece: play.setpiece ? play.setpiece.type : null, timer: Math.round(play.timer * 10) / 10,
      offside: v15 ? { home: v15.offside.home, away: v15.offside.away } : null,
      added: addedTime, clockLabel: clockLabel()
    };
  };
  /* v15 계측: 오프사이드 · 세트피스 · 퇴장 · 추가시간 */
  M.v15 = function () {
    return {
      offside: v15 ? v15.offside : null,
      setpiece: v15 ? v15.setpiece : null,
      reds: v15 ? v15.reds : 0,
      cards: v15 ? v15.cards : 0,
      added: [addedTime.first, addedTime.second],
      clock: clockLabel(),
      sentOff: { home: 11 - players.filter(function (p) { return p.side === 'home'; }).length, away: 11 - players.filter(function (p) { return p.side === 'away'; }).length },
      timeline: v15 ? v15.timeline.slice(-40) : [],
      dbg: v15 ? (v15.dbg || []) : [], chk: v15 ? (v15.chk || 0) : 0, behind: v15 ? (v15.behind || 0) : 0
    };
  };
  M.stop = function () {
    M.running = false;
    cancelAnimationFrame(rafId);
  };
  M.stats = function () {
    return {
      passes: stats.passes, tackles: stats.tackles, saves: stats.saves,
      interceptions: stats.interceptions,
      shots: goalStats, cautions: cautions.length, goals: goals.length, minute: minute(),
      momentum: Math.round(momentum), cards: cardUses
    };
  };
  /* v14 검증용: 전술 철학별 실제 플레이 계측값 */
  M.tele = function () {
    return {
      styleHome: styleKeyOf('home'), styleAway: styleKeyOf('away'),
      home: { pass: tele.pass.home, press: tele.press.home, pressHigh: tele.pressHigh.home, swarm: tele.swarm.home, longwin: tele.longwin.home,
        pressProgress: tele.pressY.home.n ? Math.round(tele.pressY.home.sum / tele.pressY.home.n) : 0,
        passDist: tele.passDist.home.n ? Math.round(tele.passDist.home.sum / tele.passDist.home.n * 10) / 10 : 0,
        shots: goalStats.homeShots, tackles: Math.round(stats.tackles), line: Math.round(defLineY('home')), shape: formationOf('home') },
      away: { pass: tele.pass.away, press: tele.press.away, pressHigh: tele.pressHigh.away, swarm: tele.swarm.away, longwin: tele.longwin.away,
        pressProgress: tele.pressY.away.n ? Math.round(tele.pressY.away.sum / tele.pressY.away.n) : 0,
        passDist: tele.passDist.away.n ? Math.round(tele.passDist.away.sum / tele.passDist.away.n * 10) / 10 : 0,
        shots: goalStats.awayShots, line: Math.round(defLineY('away')), shape: formationOf('away') }
    };
  };

  M.subState = function () {
    if (!M.running) { return null; }
    var onPitch = [], bench = [], i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== 'home') { continue; }
      onPitch.push({
        id: players[i].player.id, name: players[i].name, role: players[i].role,
        pos: players[i].pos, rating: DS.ratingOf(players[i].player), off: players[i].off
      });
    }
    for (i = 0; i < benchState.length; i++) {
      bench.push({
        id: benchState[i].player.id, name: benchState[i].player.name,
        pos: benchState[i].pos, rating: benchState[i].rating, used: benchState[i].used
      });
    }
    return {
      onPitch: onPitch, bench: bench, subsLeft: M.subsLeft,
      minute: minute(), score: M.homeScore + ' : ' + M.awayScore, halftime: M.paused
    };
  };

  M.substitute = function (inId, outId) {
    if (!M.running || M.subsLeft <= 0) { return false; }
    var outP = null, inB = null, i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'home' && players[i].player.id === outId) { outP = players[i]; }
    }
    for (i = 0; i < benchState.length; i++) {
      if (benchState[i].player.id === inId && !benchState[i].used) { inB = benchState[i]; }
    }
    if (!outP || !inB) { return false; }
    var newP = mkPlayer('home', inB.player, cfg.homeKit, outP.role, outP.pos, outP.baseX / 1, outP.baseY * 1);
    newP.baseX = outP.baseX; newP.baseY = outP.baseY;
    newP.zone = zoneFor(outP.pos, outP.baseY, 'home');
    newP.x = outP.x; newP.y = outP.y; newP.tx = outP.x; newP.ty = outP.y;
    var idx = players.indexOf(outP);
    players.splice(idx, 1, newP);
    inB.used = true;
    M.subsLeft--;
    for (i = 0; i < ratings.length; i++) {
      if (ratings[i].id === outId) {
        ratings[i].rating = clamp(ratings[i].rating - 0.3, 3.5, 10);
        ratings[i].subbedOut = true;
      }
    }
    ratings.push({
      id: inB.player.id, name: inB.player.name, role: outP.role, pos: outP.pos,
      goals: 0, assists: 0, rating: 6.0, mvp: false
    });
    if (ball.carrier === outP) { ball.carrier = null; ball.kind = 'idle'; ball.x = outP.x; ball.y = outP.y; }
    for (i = 0; i < players.length; i++) {
      if (players[i].mark === outP) { players[i].mark = null; }
    }
    charge(2);
    say('🔁 교체! ' + short(outP.name) + ' 나가고 ' + short(inB.player.name) + ' 투입됩니다. (' + minute() + "')", 'tactic');
    return true;
  };

  /* ─────────────────────────  레이아웃  ───────────────────────── */
  M.resize = resize;
  function resize() {
    if (!canvas) { return; }
    var rect = canvas.parentNode.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(180, Math.round(rect.height));
    dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    /* 가로 피치 — 스타디움 이미지가 캔버스를 꽉 채운다 */
    field = { x: 0, y: 0, w: W, h: H };
    SPR_H = Math.round(clamp(H * 0.084, 20, 42));   /* v8: v7(0.168)의 정확히 절반 크기 */
    loadPitchImage();
    buildPitchLayer();
  }

  var pitchTries = 0;
  function loadPitchImage() {
    if (pitchImg || pitchTries >= 4) { return; }
    pitchTries++;
    var img = new global.Image();
    img.onload = function () {
      pitchImg = img;
      buildPitchLayer();
      if (M.running) { draw(); }
    };
    img.onerror = function () {
      pitchImg = null;
      if (pitchTries < 4) { global.setTimeout(loadPitchImage, 3000); }
    };
    img.src = 'assets/stadium-pitch.png';
  }
  /* 페이지가 뜨자마자 피치 이미지를 미리 받아 둔다 (경기 시작 시 대기 없음) */
  loadPitchImage();

  function buildPitchLayer() {
    pitchLayer = document.createElement('canvas');
    pitchLayer.width = Math.round(W * dpr);
    pitchLayer.height = Math.round(H * dpr);
    var g = pitchLayer.getContext('2d');
    if (!g) { return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pitchImg && pitchImg.naturalWidth) {
      /* 16:9 스타디움 이미지를 cover 로 — 남는 쪽만 살짝 잘라낸다 */
      var iw = pitchImg.naturalWidth, ih = pitchImg.naturalHeight;
      var sc = Math.max(W / iw, H / ih);
      var dw = iw * sc, dh = ih * sc;
      g.drawImage(pitchImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      var vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.22, W / 2, H * 0.55, Math.max(W, H) * 0.74);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(3,18,14,0.40)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    } else {
      DS.Art.drawPitch(g, W, H, { landscape: true, crowd: true });
    }
  }

  /* ─────────────────────────  중계 · 상황 배너  ───────────────────────── */
  function say(text, kind) {
    var body = document.getElementById('m-comm-body');
    if (!body) { return; }
    var line = document.createElement('div');
    line.className = 'cmt-line ' + (kind || '');
    line.innerHTML = '<span class="cmt-min">' + minute() + "'</span>" + text;
    body.appendChild(line);
    while (body.children.length > 4) { body.removeChild(body.firstChild); }
    body.scrollTop = body.scrollHeight;
  }
  function clearCommentary() {
    var body = document.getElementById('m-comm-body');
    if (body) { body.innerHTML = ''; }
  }
  function banner(text, sub) {
    var el = document.getElementById('m-banner');
    if (!el) { return; }
    el.innerHTML = '<div class="gb-text">' + text + '</div>' + (sub ? '<div class="gb-sub">' + sub + '</div>' : '');
    el.classList.add('on');
    bannerT = 2.6;
  }
  function clearBanner() {
    var el = document.getElementById('m-banner');
    if (el) { el.classList.remove('on'); }
  }
  function updateScoreboard() {
    var a = document.getElementById('m-gf'), b = document.getElementById('m-ga'), c = document.getElementById('m-clock');
    if (a) { a.textContent = M.homeScore; }
    if (b) { b.textContent = M.awayScore; }
    if (c) { c.textContent = clockLabel(); }
  }

  /* v15 — 경기 시계: 45+2' · 90+4' 추가시간까지 표시 */
  function clockLabel() {
    var m = simTime / PER_MIN;
    if (!halftimeDone) {
      if (m >= 45) { return '45+' + clamp(Math.ceil(m - 45), 1, 9) + "'"; }
      var f = Math.floor(m);
      return (f < 10 ? '0' : '') + f + "'";
    }
    if (m >= 90) { return '90+' + clamp(Math.ceil(m - 90), 1, 9) + "'"; }
    var s = Math.floor(m);
    return (s < 10 ? '0' : '') + s + "'";
  }

  function setSit(key, extra, force) {
    var meta = SIT[key] || SIT.build;
    if (!force && play.sitKey === key) { return; }
    play.sitKey = key;
    var el = document.getElementById('m-sit');
    if (!el) { return; }
    var team = '';
    if (key !== 'corner' && key !== 'fk' && key !== 'kickoff' && key !== 'offside' && key !== 'throw' && key !== 'goalkick' && key !== 'pk') {
      team = (play.atkSide === 'home' ? cfg.homeShort : cfg.awayShort) + ' · ';
    }
    el.className = 'sit on tone-' + meta.tone;
    el.innerHTML = '<i></i><b>' + meta.label + '</b><span>' + team + (extra || meta.sub) + '</span>';
  }

  /* ─────────────────────────  포지셔닝 · AI  ───────────────────────── */
  function stagePush(p, stage) {
    var g = groupOf(p);
    var table = {
      build: { DF: 0, MF: 2, FW: 3 },
      mid: { DF: 4, MF: 6, FW: 8 },
      wide: { DF: 8, MF: 11, FW: 14 },
      final: { DF: 11, MF: 15, FW: 18 }
    };
    var row = table[stage] || table.build;
    var v = g === 'DF' ? row.DF : (g === 'MF' ? row.MF : row.FW);
    if (tactic === 'attack') { v += 3; } else if (tactic === 'defense') { v -= 2; }
    return v;
  }
  function lineDrop(p) {
    var g = groupOf(p);
    if (g === 'DF') { return 9; }
    if (g === 'MF') { return 6.5; }
    return 3.5;
  }

  function assignPressers(defSide, pc) {
    var out = [], i, p, d;
    pc = pc || pressConfig(defSide);
    var cand = [], near = null, nd = 999;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || isGK(p) || p.off) { continue; }
      d = d2(p, ball);
      if (d < nd) { nd = d; near = { p: p, d: d }; }
      if (d <= pc.radius) { cand.push({ p: p, d: d }); }
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    /* 압박 반경 밖이면 아무도 따라붙지 않고, 가장 가까운 1명만 나선다 */
    if (!cand.length && near) { cand.push(near); }
    for (i = 0; i < cand.length && i < pc.n; i++) { out.push(cand[i].p); }
    return out;
  }

  function assignMarks(defSide) {
    if (play.markT > 0) { return; }
    play.markT = 0.32;
    var i, p, q, atks = [], defs = [], used = {}, best, bd, d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.mark = null;
      if (p.off || isGK(p)) { continue; }
      if (p.side === defSide) { defs.push(p); } else { atks.push(p); }
    }
    defs.sort(function (a, b) { return b.y - a.y; });
    var isolate = buffOf('def') > 0 && defSide === 'home';
    for (i = 0; i < defs.length; i++) {
      p = defs[i];
      best = null; bd = 26;
      if (isolate && isDefGroup(p)) {
        for (var k = 0; k < atks.length; k++) {
          if (isFwdGroup(atks[k]) && !used[atks[k].player.id]) {
            d = d2(p, atks[k]);
            if (d < bd + 14) { bd = d; best = atks[k]; }
          }
        }
      }
      if (!best) {
        for (var j = 0; j < atks.length; j++) {
          q = atks[j];
          if (used[q.player.id]) { continue; }
          d = Math.hypot(q.x - p.x, (q.y - p.y) * 1.25);
          if (d < bd) { bd = d; best = q; }
        }
      }
      if (best) { p.mark = best; used[best.player.id] = true; }
    }
    void isolate;
  }

  /* 볼 주변 삼각 지원: 볼을 준 선수 주변에 좌·우·앞 3각 패스 옵션을 만든다 (v10) */
  function assignSupport(carrier) {
    var i, p, list = [], d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== carrier.side || p === carrier || p.off || isGK(p)) { continue; }
      d = Math.hypot(p.x - carrier.x, p.y - carrier.y);
      if (d < 34) { list.push({ p: p, d: d, x: p.x }); }
    }
    list.sort(function (a, b) { return a.d - b.d; });
    var dir = goalDir(carrier.side);
    /* v14 — 감독 전술: 티키타카는 삼각 거리를 좁히고, 직선 롱볼은 넓게 벌린다 */
    var gap = styleOf(carrier.side).supportGap;
    /* 좌우로 벌린 두 명 + 앞쪽 한 명 — 세 방향이 겹치지 않게 고른다 */
    var wantL = null, wantR = null, wantF = null, j, it;
    for (j = 0; j < list.length; j++) {
      it = list[j];
      if (!wantL && it.x < carrier.x - 4) { wantL = it; }
      else if (!wantR && it.x > carrier.x + 4) { wantR = it; }
      else if (!wantF) { wantF = it; }
      if (wantL && wantR && wantF) { break; }
    }
    var picks = [];
    if (wantL) {
      wantL.p.support = {
        x: clamp(carrier.x - gap * 0.85, 5, 95),
        y: clamp(carrier.y + dir * 4 + (wantL.p.y > carrier.y ? 3 : -3), 5, 115)
      };
      wantL.p.supportT = 0.9;
      picks.push(wantL.p);
    }
    if (wantR) {
      wantR.p.support = {
        x: clamp(carrier.x + gap * 0.85, 5, 95),
        y: clamp(carrier.y - dir * 3, 5, 115)
      };
      wantR.p.supportT = 0.9;
      picks.push(wantR.p);
    }
    if (wantF) {
      wantF.p.support = {
        x: clamp(carrier.x + (wantF.x < 50 ? 3 : -3), 5, 95),
        y: clamp(carrier.y + dir * gap * 1.15, 5, 115)
      };
      wantF.p.supportT = 0.9;
      picks.push(wantF.p);
    }
    play.supList = picks;      /* 피치에 패스 각을 얇게 그린다 */
  }

  /* 오프더볼 침투: 수비 라인 뒤 대각선 공간으로 뛰는 선수를 주기적으로 만든다.
     v10 — 공격 전술이면 두 명이 동시에 침투해 수비 라인을 흔든다. */
  function assignRuns(count) {
    var carrier = ball.carrier, i, p, tries = count || 1, t, best, bv;
    if (!carrier) { return; }
    var sh = shapeOf(carrier.side);
    for (t = 0; t < tries; t++) {
      var defSide = carrier.side === 'home' ? 'away' : 'home';
      var line = defLineY(defSide);
      best = null; bv = -1;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.side !== carrier.side || p === carrier || p.off || isGK(p)) { continue; }
        if (!isFwdGroup(p) && !isMidGroup(p)) { continue; }
        if (p.runT > 0.2) { continue; }                     /* 이미 뛰는 선수는 제외 */
        var prog = progressOf(p.side, p.y);
        if (prog > 0.80) { continue; }
        if (Math.hypot(p.x - carrier.x, p.y - carrier.y) < 12) { continue; }
        var v = (isFwdGroup(p) ? 20 : 0) + prog * 20 + Math.random() * 10;
        if (v > bv) { bv = v; best = p; }
      }
      if (!best) { return; }
      var dir = goalDir(best.side);
      best.runTo = {
        x: clamp(best.x + (best.baseX < 50 ? 6 : -6) + range(-4, 4), 6, 94),
        y: clamp(line - dir * range(3, sh.name === 'attack' ? 10 : 8), 4, 116)
      };
      best.runT = sh.name === 'attack' ? 1.9 : 1.5;
      if (t === 0 && chance(0.5)) { bubbleUnique(best, '🏃 침투!', '#c3a6ff', 1.1); }
    }
  }

  function nearestNToBall(side, n) {
    var cand = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      cand.push({ p: p, d: d2(p, ball) });
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    var out = [];
    for (i = 0; i < cand.length && i < n; i++) { out.push(cand[i].p); }
    return out;
  }

  function updateTargets(dt) {
    var atk = play.atkSide;
    var def = atk === 'home' ? 'away' : 'home';
    var carrier = ball.carrier;
    var pressers = carrier ? assignPressers(def, pressConfig(def)) : [];
    /* v16 — 박스 슬롯 분산 (프레임당 1회, 공격 팀 전원에게 자리 배정) */
    assignBoxSlots(atk);
    /* v14 게겐프레싱 — 볼을 잃은 직후 3명이 반경과 상관없이 즉시 달려든다 */
    if (carrier) {
      var stDef = styleOf(def);
      if (stDef.counterPress > 0 && play.recoverT > 0 && play.recoverSide === def) {
        var swarm = nearestNToBall(def, stDef.counterPress);
        if (swarm.length > 1) {
          pressers = swarm;
          if (!play.swarmed) { play.swarmed = true; tele.swarm[def] += 1; }
        }
      }
    }
    if (carrier) {
      assignMarks(def);
      play.supT -= dt;
      if (play.supT <= 0) { play.supT = 0.4; assignSupport(carrier); }
    } else {
      play.supList = null;
    }
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      if (isGK(p)) { gkTarget(p); continue; }
      if (p === carrier) { carrierTarget(p); continue; }
      if (!carrier) {
        if (ball.kind === 'pass' || ball.kind === 'shot') {
          if (p === ball.receiver) {
            p.tx = ball.aim ? ball.aim.x : ball.x;
            p.ty = ball.aim ? ball.aim.y : ball.y;
            continue;
          }
          var chase = nearestToBall(p.side, 10);
          if (chase === p) { p.tx = ball.x; p.ty = ball.y; continue; }
        } else {
          var loose = nearestToBall(p.side, 8);
          if (loose === p) { p.tx = ball.x; p.ty = ball.y; continue; }
        }
      }
      if (p.side === atk) { attackTarget(p); }
      else if (pressers.indexOf(p) >= 0) { chaseTarget(p); }
      else { defendTarget(p); }
    }
    void dt;
  }

  function chaseTarget(p) {
    var lead = 0.12;
    p.tx = clamp(ball.x + ball.vx * lead, 3, 97);
    p.ty = clamp(ball.y + ball.vy * lead, 3, 117);
    p.kind = 'chase';
  }

  /* ────── v16 — 박스 침투 타겟 슬롯 ──────
     공격수들이 모두 같은 점을 향해 달려들어 GK·수비와 한 덩어리가 되던 문제를 없앤다.
     박스에 들어가는 무명 공격수는 니어 포스트 / 페널티 스팟 / 파 포스트 / 아크 정면
     내 자리로 나눠 서고, 공을 몬 1명만 자유롭게 슈팅 각을 잡는다. */
  function assignBoxSlots(atkSide) {
    var i, p, cand = [], yg = attackGoalY(atkSide), dir = goalDir(atkSide);
    var carrier = ball.carrier;
    for (i = 0; i < players.length; i++) { players[i].boxSlot = null; }
    if (!carrier && play.phase !== 'play' && play.phase !== 'setpiece') { return; }
    /* 니어/파 포스트는 공 쪽을 기준으로 — 터치라인 근처에서만 뒤집어 목표가 튀지 않게 */
    if (ball.x < 40) { play.boxLeft = true; }
    else if (ball.x > 60) { play.boxLeft = false; }
    if (play.boxLeft == null) { play.boxLeft = true; }
    var nearX = play.boxLeft ? 42 : 58, farX = 100 - nearX;
    var slots = [
      { name: '니어포스트', x: nearX, d: 15.0 },
      { name: '페널티스팟', x: 50, d: 20.5 },
      { name: '파포스트', x: farX, d: 15.0 },
      { name: '아크정면', x: 50 + (play.boxLeft ? 4 : -4), d: 29.0 }
    ];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== atkSide || p.off || isGK(p) || p === carrier) { continue; }
      if (!isFwdGroup(p) && !(isMidGroup(p) && (p.pos === 'AM' || p.pos === 'CM'))) { continue; }
      cand.push(p);
    }
    /* 기본 위치(x) 순으로 고정 배정 — 프레임마다 자리가 바뀌지 않는다 */
    cand.sort(function (a, b) {
      if (Math.abs(a.baseX - b.baseX) > 0.01) { return a.baseX - b.baseX; }
      return String(a.name) < String(b.name) ? -1 : 1;
    });
    for (i = 0; i < cand.length && i < slots.length; i++) {
      cand[i].boxSlot = { name: slots[i].name, x: slots[i].x, y: yg - dir * slots[i].d };
    }
  }

  function carrierTarget(p) {
    var dir = goalDir(p.side);
    var gy = attackGoalY(p.side);
    var opp = nearestOpponent(p, 20);
    var avoid = 0;
    if (opp.player && opp.dist < 9) {
      avoid = (p.x >= opp.player.x ? 1 : -1) * (9 - opp.dist) * 0.7;
    }
    if (p.dribbleX != null && p.dribbleT > 0) {
      p.tx = clamp(p.dribbleX, 5, 95);
      p.ty = clamp(p.dribbleY, 4, 116);
      return;
    }
    var tx = p.x + (50 - p.x) * 0.10 + avoid;
    var ty = p.y + dir * 9;
    if (Math.abs(p.y - gy) < 18) { tx = p.x + (54 - p.x) * 0.3 + avoid; }
    p.tx = clamp(tx, 6, 94);
    p.ty = clamp(ty, 4, 116);
  }

  function attackTarget(p) {
    var z = p.zone;
    var st = play.stage;
    var m = metricsOf(p.side);
    var sty = styleOf(p.side);
    var a = anchorOf(p);
    var push = stagePush(p, st);
    var g = groupOf(p);
    var kx = g === 'DF' ? 0.17 : (g === 'MF' ? 0.19 : 0.13);   /* v8: 볼 쪽 압축을 줄여 포메이션 대형을 지킨다 */
    var ky = g === 'DF' ? 0.08 : (g === 'MF' ? 0.11 : 0.12);
    var spread = 0.94 + clamp(m.width + sty.width, 20, 99) / 100 * 0.52;   /* 폭 지표 + 감독 전술 */
    /* 공에서 먼 선수일수록 자기 구역을 지킨다 (전원이 볼로 몰리지 않게) */
    var hold = clamp(1 - (Math.hypot(p.x - ball.x, p.y - ball.y) - 18) / 55, 0.14, 1);
    var tx = 50 + (a.x - 50) * spread + (ball.x - 50) * kx * hold;
    var ty = a.y + (ball.y - 60) * ky * hold + z.dir * push;

    /* 반대편 윙어는 폭을 유지해 전환 패스 각을 만든다 */
    var farWing = (a.x < 38 && ball.x > 62) || (a.x > 62 && ball.x < 38);
    if (farWing && !isFwdGroup(p) && st !== 'final') {
      tx = 50 + (a.x - 50) * (spread + 0.10);
    }

    /* 측면: 윙어·윙백은 전 구간에서 터치라인을 넓게 쓴다 */
    if (p.pos === 'LWF') { tx = st === 'build' ? 11 : 3.5; }
    else if (p.pos === 'RWF') { tx = st === 'build' ? 89 : 96.5; }
    else if (p.pos === 'LWB') { tx = st === 'build' ? 9 : 4; }
    else if (p.pos === 'RWB') { tx = st === 'build' ? 91 : 96; }

    /* 윙백 오버래핑: 폭 넓은 백3·백5 포메이션은 터치라인을 타고 박스 옆까지 올라간다 */
    if ((p.pos === 'LWB' || p.pos === 'RWB') && m.width >= 64) {
      tx = p.pos === 'LWB' ? 3 : 97;
      if (st === 'mid' || st === 'wide' || st === 'final') {
        ty = attackGoalY(p.side) - z.dir * (st === 'final' ? 13 : 21);
      }
    }

    /* 최전방: 박스 안으로 파고든다 */
    if (isFwdGroup(p) && st === 'final') {
      ty = attackGoalY(p.side) - z.dir * 13;
      tx = 50 + (a.x - 50) * 0.72;
    }

    /* v10 — 공격 전술: 풀백·윙백이 터치라인을 타고 하프라인을 넘어 오버래핑한다 */
    var sh = shapeOf(p.side);
    if (sh.name === 'attack' && (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB')) {
      var leftSide = (p.pos === 'LB' || p.pos === 'LWB');
      tx = leftSide ? clamp(3.5 + (1 - progressOf(p.side, ball.y)) * 5, 3, 12) : clamp(96.5 - (1 - progressOf(p.side, ball.y)) * 5, 88, 97);
      if (st === 'mid' || st === 'wide' || st === 'final') {
        ty = Math.min(ty, attackGoalY(p.side) - z.dir * (st === 'final' ? 22 : 34));
      }
    }
    /* v10 — 2선 침투: 공격 전술이면 AM/CM이 박스 앞까지 올라와 슈팅 옵션이 된다 */
    if (sh.name === 'attack' && (p.pos === 'AM' || p.pos === 'CM') && (st === 'wide' || st === 'final') && ball.carrier) {
      var carryProg = progressOf(ball.carrier.side, ball.carrier.y);
      if (carryProg > 0.45) {
        ty -= z.dir * (st === 'final' ? 9 : 5);
        tx += (p.baseX < 50 ? 4 : -4);
      }
    } else if (sh.secondLine > 0 && (p.pos === 'AM' || p.pos === 'CM') && st === 'final') {
      ty -= z.dir * 5 * sh.secondLine;
    }

    /* ── v14 감독 전술 철학: 침투 인원 · 하이 라인 · 폭 성향 ── */
    if (sty.throughBias > 1.6 && (g === 'MF' || isFwdGroup(p)) && st !== 'build') { ty -= z.dir * 2.5; }
    if (sty.crossBias > 1.8 && (p.pos === 'LWF' || p.pos === 'RWF') && st !== 'build') {
      tx = p.pos === 'LWF' ? 2.6 : 97.4;
      if (st === 'wide' || st === 'final') { ty -= z.dir * 4; }
    }

    /* ── v14 변칙 포메이션 morph: 공격 시 대형이 실제로 바뀐다 ── */
    var mo = morphOf(p.side);
    if (mo) {
      if (mo.boxMid > 0 && (p.pos === 'DM' || ((p.pos === 'LB' || p.pos === 'RB') && (mo.fbIn || 0) >= 0.5))) {
        var cx2 = p.baseX < 50 ? 42.5 : 57.5;
        tx = tx * (1 - 0.72 * mo.boxMid) + cx2 * (0.72 * mo.boxMid);
        if (st !== 'build') { ty -= z.dir * 5 * mo.boxMid; }
      }
      if (mo.wbUp > 0 && (p.pos === 'LWB' || p.pos === 'RWB')) {
        if (st === 'mid' || st === 'wide' || st === 'final') {
          tx = p.pos === 'LWB' ? 3.6 : 96.4;
          ty -= z.dir * (st === 'final' ? 18 : 27);
        }
      }
      if (mo.diamond > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        if (st === 'wide' || st === 'final') {
          tx += (p.baseX < 50 ? 11 : -11);
          ty -= z.dir * 6;
        }
      }
      if (mo.fbIn > 0 && (p.pos === 'LB' || p.pos === 'RB') && st !== 'build') {
        tx += (p.baseX < 50 ? 9 : -9) * mo.fbIn;
      }
      if (mo.wingHigh > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        tx = p.pos === 'LWF' ? 3 : 97;
        if (st !== 'build') { ty -= z.dir * 5; }
      }
    }

    /* 하프스페이스 카드: AM/WF 대각선 침투 */
    if (buffOf('atk') > 0 && (p.pos === 'AM' || p.pos === 'LWF' || p.pos === 'RWF') && st !== 'build') {
      ty += z.dir * 8;
      tx += (a.x < 50 ? 8 : -8);
    }
    /* 라인 브레이크: 중원 한 칸 전진 */
    if (buffOf('through') > 0 && g === 'MF') { ty += z.dir * 4; }
    /* 골키퍼 빌드업: 후방 라인도 함께 올라와 짧은 패스 각을 만든다 */
    if (buffOf('build') > 0 && (isGK(p) || isDefGroup(p))) { ty += z.dir * 3; }
    /* 오프사이드 트랩: 수비 라인이 동시에 전진 */
    if (p.side === 'home' && buffOf('offside') > 0 && g === 'DF' && ball.y < 70) { ty += z.dir * 3; }

    /* 삼각 지원: 볼 주변 동료가 패스 각으로 벌어진다 */
    if (p.supportT > 0 && p.support) {
      tx = tx * 0.42 + p.support.x * 0.58;
      ty = ty * 0.42 + p.support.y * 0.58;
    }
    /* 수비 뒷공간 대각선 침투 */
    if (p.runT > 0 && p.runTo) {
      tx = tx * 0.34 + p.runTo.x * 0.66;
      ty = ty * 0.34 + p.runTo.y * 0.66;
    }

    /* ── v15: 공 없는 움직임을 진짜 축구처럼 ── */
    var carrierV = ball.carrier;
    var gyv = attackGoalY(p.side);
    var oLine = offsideLineY(p.side === 'home' ? 'away' : 'home');

    /* ① 빌드업: CB가 좌우로 벌리고, DM이 내려와 삼각 패스 각을 만들고, 윙백이 전진한다 */
    if (st === 'build') {
      if (p.pos === 'CB') {
        tx = p.baseX < 50 ? 24 : 76;
        ty = a.y - z.dir * 1.5;
      } else if (p.pos === 'DM') {
        tx = 50 + (a.x - 50) * 0.7;
        ty = a.y + z.dir * 3.5;
      } else if (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB') {
        ty = a.y - z.dir * 8;
      }
    }

    /* ② 스트라이커: 오프사이드 라인 끝자락을 타며 좌우로 흔들다가 뒷공간으로 침투 */
    if (isFwdGroup(p) && carrierV && (st === 'build' || st === 'mid')) {
      var sLine0 = supportLineY(p.side);
      tx = 50 + (a.x - 50) * 0.75 + Math.sin(simTime * 0.85 + p.baseX * 0.11) * 7;
      ty = sLine0 - z.dir * 2.0;
      if (chance(0.008)) {
        p.runTo = { x: clamp(tx + range(-9, 9), 6, 94), y: clamp(sLine0 - z.dir * range(7, 15), 4, 116) };
        p.runT = 1.6;
        bubbleUnique(p, '🏃 뒷공간!', '#c3a6ff', 1.1);
      }
    }

    /* ②-b v16 — 박스 안 타겟 슬롯: 니어포스트·페널티스팟·파포스트·아크정면으로 분산
       공을 몬 선수가 없어도(크로스·슛이 날아가는 중) 슬롯을 잠그한 자리를 지킨다. */
    if (p.boxSlot) {
      var carryProg2 = progressOf(p.side, ball.y);
      if (carryProg2 > 0.50) {
        var slotW = clamp((carryProg2 - 0.50) / 0.22, 0, 1) * 0.84;
        tx = tx * (1 - slotW) + p.boxSlot.x * slotW;
        ty = ty * (1 - slotW) + p.boxSlot.y * slotW;
      }
    }

    /* ③ 측면 돌파: 같은 쪽 윙백이 바깥으로 오버래핑, 반대편 윙어는 박스 먼 쪽으로 침투 */
    if (carrierV && carrierV.side === p.side && carrierV !== p && (st === 'wide' || st === 'final')) {
      var ballLeft = ball.x < 50;
      var isWB = (p.pos === 'LB' || p.pos === 'LWB' || p.pos === 'RB' || p.pos === 'RWB');
      var wbLeft = (p.pos === 'LB' || p.pos === 'LWB');
      if (isWB && ballLeft === wbLeft) {
        tx = ballLeft ? 2.6 : 97.4;
        ty = clamp(ball.y + z.dir * 4, 4, 116);
      }
      if ((p.pos === 'LWF' && !ballLeft) || (p.pos === 'RWF' && ballLeft)) {
        tx = 50 + (ballLeft ? 10 : -10);
        ty = gyv - z.dir * 11;
      }
    }

    /* ⑤ 오프사이드 라인 존중: 공이 라인 뒤에 있는 동안 비소유 공격수는 라인 안쪽에 머문다
       (라인을 넘는 것은 침투 러닝이 걸린 순간에만) */
    if (p !== carrierV && !isDefGroup(p)) {
      var sLine = supportLineY(p.side);
      var ballBeyond = z.dir < 0 ? (ball.y < sLine) : (ball.y > sLine);
      if (!ballBeyond && p.runT <= 0.15) {
        var lim = sLine - z.dir * 1.8;
        if (z.dir < 0) { if (ty < lim) { ty = lim; } }
        else if (ty > lim) { ty = lim; }
      }
    }

    /* ⑤-b v16 — GK 보호: 공을 몬 1명 말고는 상대 골키퍼 코앞에 붙지 않는다 */
    if (p !== carrierV) {
      var ogk = goalkeeper(p.side === 'home' ? 'away' : 'home');
      if (ogk) {
        var guardPx = 1.6 * 2 * SPR_H * TOKEN_R;          /* GK 중심에서 1.6 지름 이상 */
        var gdx = tx - ogk.x, gdy = ty - ogk.y;
        var grt = sepRates(clamp(ogk.x / WORLD_W, 0, 1));
        var gd = Math.hypot(gdy * grt.ky, gdx * grt.kx);
        if (gd < guardPx) {
          if (gd < 0.001) { gdx = 0; gdy = 1; gd = 1; }
          tx = ogk.x + gdx * guardPx / gd;
          ty = ogk.y + gdy * guardPx / gd;
        }
      }
    }

    /* ④ 전술 버튼(수비/군형/공격): 누르면 라인·폭이 눈앞에서 확 달라진다 */
    if (p.side === 'home') {
      var shpV = shapeOf('home').name;
      if (shpV === 'attack') { ty -= z.dir * 4; tx = 50 + (tx - 50) * 1.06; }
      else if (shpV === 'defense') { ty += z.dir * 3; tx = 50 + (tx - 50) * 0.93; }
    }

    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, a.y - z.fwd - 8, a.y + z.back + 8);
    p.ty = clamp(p.ty, 3, WORLD_H - 3);
    /* v16 — 비소유 공격수는 6야드 박스 안으로 빨려 들어가지 않는다 */
    if (p !== carrierV && !isDefGroup(p)) {
      var deepLim2 = attackGoalY(p.side) - z.dir * 9.5;
      if (z.dir < 0) { if (p.ty < deepLim2) { p.ty = deepLim2; } }
      else if (p.ty > deepLim2) { p.ty = deepLim2; }
    }
    p.kind = 'atk';
  }

  function defendTarget(p) {
    var z = p.zone;
    var a = anchorOf(p);
    var g = groupOf(p);
    var m = metricsOf(p.side);
    var sh = shapeOf(p.side);
    var sty = styleOf(p.side);
    var compress = 0.94 - (clamp(m.width + sty.width, 20, 99) / 100) * 0.06;   /* 좁은 포메이션은 중앙으로 더 모인다 */
    compress *= sh.width;                            /* 수비 전술은 폭을 더 좁혀 두 줄 블록을 만든다 */
    compress *= sty.blockWidth;                      /* 감독 전술: 블록 폭 성향 */
    /* 공에서 먼 수비수는 자기 구역·라인 간격을 유지한다 */
    var hold = clamp(1 - (Math.hypot(p.x - ball.x, p.y - ball.y) - 16) / 50, 0.16, 1);
    var tx = 50 + (a.x - 50) * compress + (ball.x - 50) * (0.18 + (sh.name === 'defense' ? 0.05 : 0)) * hold;
    var ty = a.y + (ball.y - 60) * 0.08 * hold;
    /* 윙어·윙백은 수비 시에도 터치라인 폭을 지켜 상대 전환 패스를 막는다 */
    if (p.pos === 'LWF' || p.pos === 'LWB') { tx = Math.min(tx, 13); }
    if (p.pos === 'RWF' || p.pos === 'RWB') { tx = Math.max(tx, 87); }
    var drop = 0;
    if (play.recoverT > 0 && play.recoverSide === p.side) { drop += 4; }
    if (p.side === 'home' && sh.name === 'defense') { drop += 3; }
    ty += z.dir * -drop * (g === 'DF' ? 1 : 0.6);

    /* v10 — 두 줄 블록: 수비 라인(DF)을 기준으로 중원·최전방을 일정 간격에 세운다 (4-4 / 5-3 컴팩트) */
    var blockY = bankYOf(p.side, g);
    var bw = sh.bankW * (p.mark && !p.mark.off ? 0.80 : 1);   /* 마킹 중이어도 대형은 유지 */

    if (p.mark && !p.mark.off) {
      var mk = p.mark;
      var gap = p.side === 'home' ? 2.4 : -2.4;
      var tight = (p.side === 'home' && buffOf('def') > 0 && isDefGroup(p)) ? 0.62 : 0;
      var w = 0.40 + tight * 0.28;
      tx = tx * (1 - w) + (mk.x + tight * 0.7 * (mk.x < 50 ? 1 : -1)) * w;
      ty = ty * (1 - w) + (mk.y + gap) * w;
      if (p.side === 'home' && buffOf('offside') > 0 && g === 'DF') { ty -= 3; }
    }
    /* 블록 라인을 마지막에 다시 세운다 — 마크에 끌려 라인이 무너지지 않게 */
    ty = ty * (1 - bw) + blockY * bw;

    /* 마크·블록에 끌려 라인이 무너지지 않도록 전후 제한 (블록 라인은 허용 범위에 포함) */
    var lo = Math.min(a.y - 6, blockY - 6), hi = Math.max(a.y + 12, blockY + 6);
    if (p.side !== 'home') {
      lo = Math.min(a.y - 12, blockY - 6); hi = Math.max(a.y + 6, blockY + 6);
    }
    ty = clamp(ty, lo, hi);
    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, Math.min(a.y - z.fwd - 8, blockY - 8), Math.max(a.y + z.back + 8, blockY + 8));
    p.ty = clamp(p.ty, 3, WORLD_H - 3);

    /* ── v16: 공수 전환·수비 복귀 정상화 ──
       볼 소유가 바뀌면 CB/DM/FB는 무조건 볼보다 자기 골문 쪽으로 내려서
       '볼과 골문 사이'에 수비 블록을 만든다. (역습 당해 볼 뒤에 서 있던 라인을 되돌린다) */
    if ((isDefGroup(p) || p.pos === 'DM') && p.ty > 0) {
      var ownY = ownGoalY(p.side);
      var tOwn = p.side === 'home' ? 1 : -1;
      var ballOurSide = p.side === 'home' ? (ball.y > 52) : (ball.y < 68);
      if (ballOurSide) {
        var capY = ownY - tOwn * (isDefGroup(p) ? 4.5 : 12);   /* 6야드 박스 안까지 내려앉지는 않는다 */
        var guardY = ball.y + tOwn * 3.2;
        if (p.side === 'home') {
          p.ty = Math.max(p.ty, Math.min(guardY, capY));
        } else {
          p.ty = Math.min(p.ty, Math.max(guardY, capY));
        }
        p.ty = clamp(p.ty, 3, WORLD_H - 3);
      }
    }
    p.kind = 'def';
  }

  function gkTarget(p) {
    var z = p.zone;
    var gy = ownGoalY(p.side);
    var dir = goalDir(p.side);
    var depth = 6;
    if (ball.kind === 'shot') { depth = 4.2; }
    var tx = clamp(50 + (ball.x - 50) * 0.55, 40, 60);
    var ty = gy - dir * depth;
    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, z.yMin, z.yMax);
    p.kind = 'gk';
  }

  /* ─────────────────────────  이동  ───────────────────────── */
  function movePlayer(p, dt) {
    var spd = 9.2 + (p.player.stats.spd / 99) * 8.2;
    if (isGK(p)) { spd = 10.4 + p.player.stats.spd / 40; }
    if (ball.carrier === p) { spd *= 0.93; }
    /* v16 — 볼을 잃은 팀의 수비 라인은 즉시 자기 골문으로 되돌아간다 */
    if (play.recoverT > 0 && play.recoverSide === p.side && !isGK(p) && (isDefGroup(p) || p.pos === 'DM')) {
      spd *= 1.26;
    }
    if (buffOf('tempo') > 0) { spd *= 1.18; }
    if (buffOf('roar') > 0) { spd *= 1.1; }
    if (p.side === 'home' && mfx('speed') > 0) { spd *= 1 + Math.min(0.12, mfx('speed') * 0.006); }
    if (p.stun > 0) { p.stun -= dt; spd *= 0.32; }
    var dx = p.tx - p.x, dy = p.ty - p.y;
    var d = Math.hypot(dx, dy);
    if (d > 0.35) {
      var step = Math.min(d, spd * dt);
      p.vx = (dx / d) * spd;
      p.vy = (dy / d) * spd;
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.phase += dt * (6.4 + spd * 0.26) * Math.min(1.35, d / 3 + 0.55);
      p.frame = Math.floor(p.phase) % 4;
      if (Math.abs(dx) > 0.4) { p.facing = dx > 0 ? 1 : -1; }
      p.moving = true;
      p.speed = spd;
    } else {
      p.vx = 0; p.vy = 0; p.moving = false; p.frame = 0; p.speed = 0;
    }
    p.x = clamp(p.x, 2, WORLD_W - 2);
    p.y = clamp(p.y, 2, WORLD_H - 2);

    /* 체력 소모 — 달린 양·지구력·압박 성향으로 결정. GK는 절반 */
    if (!p.off) {
      var toughS = (p.player && p.player.stamina) ? p.player.stamina : 6;
      var drain = (0.60 + (p.moving ? 0.21 : 0)) * (1.22 - toughS * 0.038) * (96 / MATCH_SECONDS);
      if (isGK(p)) { drain *= 0.55; }
      if (p.side === 'home' && buffOf('press') > 0) { drain *= 1.10; }
      p.stam = clamp(p.stam - drain * dt, 3, 100);
    }
  }

  /* 화면 픽셀 → 월드 단위 환산비 (원근 투영 때문에 월드 단위 간격은 화면에서 왜곡된다)
     v = 폭(x) 비율 — 화면 x는 공격축(y), 화면 y는 폭(x)에 대응한다. */
  function sepRates(v) {
    var l = field.x + field.w * (PROJ.farL + (PROJ.nearL - PROJ.farL) * v);
    var r = field.x + field.w * (PROJ.farR + (PROJ.nearR - PROJ.farR) * v);
    return {
      ky: Math.max(0.5, (r - l) / WORLD_H),
      kx: Math.max(0.2, field.h * (PROJ.nearY - PROJ.farY) * (0.52 + 0.96 * v) / WORLD_W)
    };
  }
  /* 두 지점의 '화면 픽셀' 거리 — 토큰 크기와 같은 기준으로 겹침을 잰다 */
  function pxDist(ax, ay, bx, by) {
    var rt = sepRates(clamp((ax + bx) / 2 / WORLD_W, 0, 1));
    return Math.hypot((ay - by) * rt.ky, (ax - bx) * rt.kx);
  }

  /* ─────────────────────────  v16 전 프레임 Hard Separation  ─────────────────────────
     v8~v15는 화면 최소 간격을 토큰 지름의 0.70배로 두고, 공 소유자 쌍은 0.26배까지 풀어 줘서
     GK·공격수·수비수가 한 점에서 한 덩어리로 보였다. v16은 예외 없이 모든 쌍을
     '토큰 지름 × 1.18' 이상 벌리고, 3회 relaxation으로 매 틱 끝에서 강제한다. */
  var SEP_K = 1.18;        /* 최소 중심 거리 = 토큰 지름 × 1.18 */
  var sepMove = 0;         /* 계측: 이번 틱 분리로 밀린 총 거리(월드 단위) */
  function separate() {
    var i, j, a, b, dx, dy, rt, sx, sy, dpx, minPx, push, ux, uy, sa, sb, pass, m;
    sepMove = 0;
    var guardOn = play.phase !== 'setpiece';
    var gkNeed = 1.6 * 2 * SPR_H * TOKEN_R;
    for (pass = 0; pass < 3; pass++) {
      /* v16 — GK 보호 반경(위치 강제): 공을 몬 1명 말고는 상대 GK 코앞에 서지 못한다 */
      if (guardOn) {
        for (j = 0; j < 2; j++) {
          var og = goalkeeper(j === 0 ? 'home' : 'away');
          if (!og) { continue; }
          var grt = sepRates(clamp(og.x / WORLD_W, 0, 1));
          for (i = 0; i < players.length; i++) {
            a = players[i];
            if (a.off || a.side === og.side || isGK(a) || a === ball.carrier) { continue; }
            var gdx = a.x - og.x, gdy = a.y - og.y;
            var gd = Math.hypot(gdy * grt.ky, gdx * grt.kx);
            if (gd < gkNeed) {
              if (gd < 0.01) { gdx = 0; gdy = 1; gd = 1; }
              a.x = clamp(og.x + gdx * gkNeed / gd, 2, WORLD_W - 2);
              a.y = clamp(og.y + gdy * gkNeed / gd, 2, WORLD_H - 2);
            }
          }
        }
      }
      for (i = 0; i < players.length; i++) {
        a = players[i];
        if (a.off) { continue; }
        for (j = i + 1; j < players.length; j++) {
          b = players[j];
          if (b.off) { continue; }
          dx = b.x - a.x; dy = b.y - a.y;
          rt = sepRates(clamp((a.x + b.x) / 2 / WORLD_W, 0, 1));
          sx = -dy * rt.ky;              /* 화면 x 차이(px) */
          sy = dx * rt.kx;               /* 화면 y 차이(px) */
          dpx = Math.hypot(sx, sy);
          sa = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(a.x / WORLD_W, 0, 1);
          sb = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(b.x / WORLD_W, 0, 1);
          minPx = 2 * SPR_H * TOKEN_R * (sa + sb) / 2 * SEP_K;
          if (dpx < 0.0001) {              /* 완전히 같은 점 — 결정적 방향으로 갈라놓는다 */
            dx = 0.4 * (i % 2 ? 1 : -1); dy = 0.4 * (j % 2 ? 1 : -1);
            sx = -dy * rt.ky; sy = dx * rt.kx; dpx = Math.hypot(sx, sy);
          }
          if (dpx < minPx) {
            push = (minPx - dpx) * 0.5;    /* 두 선수가 반씩 나눠 밀린다 */
            ux = sx / dpx; uy = sy / dpx;
            a.x -= (uy * push) / rt.kx;
            a.y += (ux * push) / rt.ky;
            b.x += (uy * push) / rt.kx;
            b.y -= (ux * push) / rt.ky;
            m = clamp((minPx - dpx) / 2 / Math.min(rt.kx, rt.ky) * 0.5, 0, 2);
            sepMove += m;
          }
        }
      }
      for (i = 0; i < players.length; i++) {
        if (players[i].off) { continue; }
        players[i].x = clamp(players[i].x, 2, WORLD_W - 2);
        players[i].y = clamp(players[i].y, 2, WORLD_H - 2);
      }
    }
  }

  /* ─────────────────────────  볼 · 패스 · 슛  ───────────────────────── */
  function bubble(p, text, color, t) {
    if (!p) { return; }
    p.bubble = { text: text, color: color || '#d8ff8a', t: t || 1.5, t0: t || 1.5 };
    p.skillT = Math.max(p.skillT || 0, t || 1.2);
  }

  /* v16 — 같은 문구 말풍선이 여러 명에게 동시에 뜨면 글자가 겹친다. 문구당 한 번에 1명만. */
  function bubbleUnique(p, text, color, t) {
    var i, q;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q !== p && q.bubble && q.bubble.text === text && q.bubble.t > 0.3) { return false; }
    }
    bubble(p, text, color, t);
    return true;
  }

  function giveBall(p) {
    if (!p) { return; }
    /* v15 — 오프사이드 깃발이 올라간 선수가 공에 관여하면 그 자리에서 간접 프리킥 */
    if (ball.offside && !ball.offside.done && ball.offside.player === p && ball.offside.player.side === p.side) {
      awardOffside(p);
      return;
    }
    ball.offside = null;
    ball.lastTouch = p.side;
    var prev = ball.carrier ? ball.carrier.side : ball.from ? ball.from.side : null;
    if (ball.carrier && ball.carrier !== p) { ball.carrier.stun = Math.max(ball.carrier.stun, 0.15); }
    ball.carrier = p;
    ball.from = null;
    ball.receiver = null;
    ball.kind = 'idle';
    ball.flight = 0;
    ball.dur = 0;
    ball.aim = null;
    ball.shot = null;
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    p.throughRun = null;
    p.dribbleT = 0;
    play.swarmed = false;
    actionTimer = 0.34 + Math.random() * 0.26;
    play.atkSide = p.side;
    play.looseT = 0;
    if (prev && prev !== p.side) {
      onTurnover(prev, p);
    }
    if (p.side === 'home') { charge(0.4); }
  }

  function counterLongBall(p) {
    var dirF = p.side === 'home' ? 1 : -1;
    var best = null, bv = -1e9, i, q, fwd, open, v;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== p.side || q === p || q.off || isGK(q)) { continue; }
      fwd = (p.y - q.y) * dirF;
      if (fwd < 8) { continue; }
      open = nearestOpponent(q, 26).dist;
      v = fwd * 1.6 + open * 0.85 + (isFwdGroup(q) ? 14 : 0);
      if (v > bv) { bv = v; best = q; }
    }
    if (!best) { return false; }
    bubble(p, '⚡ 탈취 후 롱패스!', '#9fd8ff', 1.3);
    say('⚡ ' + U.josa(short(p.name), '이/가') + ' 탈취 직후 단번에 전방으로 롱패스!', 'normal');
    return kickPass(p, best, 'through');
  }

  function onTurnover(fromSide, toP) {
    var prog = progressOf(toP.side, toP.y);
    play.recoverSide = fromSide;
    play.recoverT = 2.1;    /* v16 — 되돌아오는 시간을 조금 더 준다 (수비 블록 재형성) */
    var sty = styleOf(toP.side);
    if (prog < 0.5 && sty.longBallAfterWin > 0 && chance(sty.longBallAfterWin)) {
      tele.longwin[toP.side] += 1;
      if (counterLongBall(toP)) { return; }
    }
    if (prog < 0.45) {
      play.counterSide = toP.side;
      play.counterT = 5.5;
      setSit(toP.side === 'home' ? 'counterAtk' : 'counterDef', '', true);
      say(toP.side === 'home'
        ? '⚡ 볼을 끊고 빠른 역습! 상대 수비가 흐트러졌습니다!'
        : '⚠️ 위험합니다! 상대 역습이 시작됩니다 — 수비 라인 복귀!', 'tackle');
    }
  }

  function kickBall(from, tx, ty, speed, kind, receiver, loft) {
    var dx = tx - ball.x, dy = ty - ball.y;
    var d = Math.max(1.2, Math.hypot(dx, dy));
    if (from) { ball.lastTouch = from.side; }
    ball.carrier = null;
    ball.from = from || null;
    ball.receiver = receiver || null;
    ball.kind = kind;
    ball.flight = 0;
    ball.dur = d / speed;
    ball.vx = dx / ball.dur;
    ball.vy = dy / ball.dur;
    ball.aim = { x: tx, y: ty };
    ball.trail = [{ x: ball.x, y: ball.y, z: 0 }];
    /* 높이: 로프트가 있으면 발을 떠나 포물선을 그린다 (땅볼 패스는 z=0) */
    if (loft) {
      ball.vz = BALL_G * ball.dur * (0.48 + 0.22 * Math.min(1, d / 45));
      ball.z = 0.8;
    } else {
      ball.vz = 0;
      ball.z = 0;
    }
    M.phase = kind === 'shot' ? 'shot' : 'pass';
  }

  /* ─────────────────────────  v15 진짜 축구 규칙: 오프사이드  ─────────────────────────
     패스 출발 순간 ① 상대 진영 ② 공보다 앞 ③ 상대 골키퍼를 뺀 최후방 수비수보다 앞 → 오프사이드.
     부심 깃발·점선 라인을 2초 남기고, 그 선수가 공에 관여하는 순간 휫슬 → 상대 간접 프리킥. */
  function offsideLineY(defSide) {
    var line = null, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || p.off || isGK(p)) { continue; }
      if (line === null) { line = p.y; }
      else if (defSide === 'home') { line = Math.max(line, p.y); }
      else { line = Math.min(line, p.y); }
    }
    if (line === null) { line = defSide === 'home' ? WORLD_H : 0; }
    return line;
  }

  /* v16 — 공격수 위치 기준선: 상대 최후방 '두 번째' 선수 (GK 포함).
     GK가 가장 깊으면 그 앞 수비수가 라인이 되므로, 공격수가 GK 코앞까지 빨려 들어가지 않는다. */
  function supportLineY(atkSide) {
    var defSide = atkSide === 'home' ? 'away' : 'home';
    var ys = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || p.off) { continue; }
      ys.push(p.y);
    }
    if (!ys.length) { return defSide === 'home' ? WORLD_H : 0; }
    ys.sort(function (a, b) { return a - b; });
    if (defSide === 'away') { return ys[Math.min(1, ys.length - 1)]; }   /* away 골문 = y 0 */
    return ys[Math.max(0, ys.length - 2)];                                /* home 골문 = y 120 */
  }

  function isOffsidePos(q) {
    if (!q || q.off) { return false; }
    if (progressOf(q.side, q.y) < 0.5) { return false; }
    var line = offsideLineY(q.side === 'home' ? 'away' : 'home');
    var beyond = q.side === 'home' ? (q.y < line - 0.8) : (q.y > line + 0.8);
    if (!beyond) { return false; }
    return q.side === 'home' ? (q.y < ball.y - 0.4) : (q.y > ball.y + 0.4);
  }

  function offsideCheck(target) {
    if (!target || target.off) { return null; }
    var side = target.side;
    if (progressOf(side, target.y) < 0.5) { return null; }
    var line = offsideLineY(side === 'home' ? 'away' : 'home');
    var beyond = side === 'home' ? (target.y < line - 1.8) : (target.y > line + 1.8);
    if (!beyond) { return null; }
    var ahead = side === 'home' ? (target.y < ball.y - 0.4) : (target.y > ball.y + 0.4);
    if (!ahead) { return null; }
    return { line: line, x: target.x, y: target.y };
  }

  function flagOffside(q, ofs) {
    if (v15) {
      v15.dbg = v15.dbg || [];
      v15.dbg.push([q.pos, Math.round(q.y), Math.round(ofs.line), Math.round(ball.y)]);
      if (v15.dbg.length > 60) { v15.dbg.shift(); }
    }
    ball.offside = { player: q, x: ofs.x, y: ofs.y, line: ofs.line, done: false };
    flagShow = { t: 2.8, y: ofs.line, side: q.side };
    bubble(q, '🚩', '#ffd85a', 1.8);
  }

  function awardOffside(p) {
    var defSide = p.side === 'home' ? 'away' : 'home';
    var line = ball.offside ? ball.offside.line : offsideLineY(defSide);
    if (v15) { v15.offside[p.side] += 1; }
    logEvt('offside', p.side, p.x, p.y);
    flagShow = { t: 2.4, y: line, side: p.side };
    banner('🚩 오프사이드!', teamShort(defSide) + ' 간접 프리킥');
    bannerT = 1.9;
    say('🚩 오프사이드! ' + U.josa(short(p.name), '이/가') + ' 패스 순간 수비 라인보다 앞서 있었습니다 — ' +
      teamShort(defSide) + ' 간접 프리킥.', 'tackle');
    ball.offside = null;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    ball.x = clamp(p.x, 8, 92);
    ball.y = clamp(p.y, 8, 112);
    freeKick(defSide, ball.x, ball.y, true);
    setSit('offside', short(p.name) + ' 오프사이드', true);
  }

  function isBehindLine(q) {
    var defSide = q.side === 'home' ? 'away' : 'home';
    var line = defLineY(defSide);
    return q.side === 'home' ? q.y < line : q.y > line;
  }

  function passBall(p) {
    var tiki = buffOf('tiki') > 0;
    var through = buffOf('through') > 0;
    var sty = styleOf(p.side);
    var best = null, bestScore = -1e9, i, q, d, fwd, open, score;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 5 || d > (sty.maxPass || 55)) { continue; }
      if (isGK(q)) {
        /* 골키퍼는 최후의 안전 패스만 */
        if (play.stage !== 'build' || d > 26) { continue; }
      }
      fwd = (p.y - q.y) * (p.side === 'home' ? 1 : -1);
      open = nearestOpponent(q, 26).dist;
      if (play.stage === 'build') {
        score = -Math.abs(d - 17) * 0.55 + open * 1.35 - Math.max(0, fwd - 6) * 0.5
          + (isMidGroup(q) ? 7 : 0) + (isDefGroup(q) ? 4 : 0);
      } else if (play.stage === 'mid') {
        score = fwd * 1.35 - d * 0.16 + open * 1.3 - (fwd < -7 ? 12 : 0);
      } else {
        score = fwd * 1.75 - d * 0.10 + open * 1.35 - (fwd < -10 ? 22 : 0);
      }
      if (tiki && d < 18) { score += 9; }
      if (tiki && d > 30) { score -= 6; }
      if (through && isBehindLine(q) && open > 4) { score += 26; }
      if (buffOf('build') > 0 && d < 26) { score += 7; }
      if (p.side === 'away' && buffOf('def') > 0 && isFwdGroup(q)) { score -= 16; }
      if (p.side === 'away' && buffOf('offside') > 0 && isBehindLine(q)) { score -= 12; }
      /* v15 — 이미 오프사이드 위치에 선 동료에게는 패스를 넣지 않는다 (라인을 타는 타이밍) */
      if (isOffsidePos(q)) { score -= 46; }
      /* 감독 조직력 업: 오프더볼 위치 선정 → 전진 옵션을 먼저 본다(작게) */
      if (p.side === 'home' && mfx('org') > 0) {
        score += Math.min(18, Math.max(0, fwd)) * mfx('org') * 0.03;
      }
      if (q.mark && q.mark === p) { score -= 4; }
      /* 반대편 전환: 볼에서 먼 쪽 윙어·풀백이 비어 있으면 적극적으로 본다 */
      if (Math.abs(q.x - p.x) > 22 && open > 6) { score += 9; }
      /* v14 감독 전술: 짧은 패스 취향 / 직선 롱볼 / 수비 뒤 스루패스 성향 */
      score += sty.shortBias * (d < 18 ? 12 : (d > 30 ? -12 : 0));
      score += sty.longBias * (d > 28 ? 12 : 0);
      if (isBehindLine(q) && open > 4) { score += (sty.throughBias - 1) * 11; }
      score += Math.random() * 5;
      if (score > bestScore) { bestScore = score; best = { q: q, d: d, fwd: fwd, open: open }; }
    }
    if (!best) { return false; }
    var type = 'short';
    if (play.stage === 'final' && (p.x < 24 || p.x > 76) && best.fwd > -2) { type = 'cross'; }
    else if (through && best.fwd > 5 && best.open > 4) { type = 'through'; }
    else if (Math.abs(best.q.x - p.x) > 20 && chance(0.62)) { type = 'switch'; }
    else if (play.stage === 'mid' && best.fwd > 8 && best.open > 8 && chance(0.45)) { type = 'through'; }
    else if (best.fwd > 5) { type = 'progressive'; }
    /* v14 — 크로스 성향이 낮은 감독(티키타카)은 박스 옆에서 올리지 않고 안으로 접어 연결한다 */
    if (type === 'cross' && !chance(clamp(0.62 * sty.crossBias, 0.12, 0.98))) { type = 'progressive'; }
    /* v14 — 스루패스 성향이 강한 감독(역습·직선)은 중원에서도 뒤공간을 먼저 본다 */
    if (type === 'progressive' && sty.throughBias > 1.2 && best.open > 5 && chance(clamp((sty.throughBias - 1) * 0.5, 0, 0.6))) { type = 'through'; }
    return kickPass(p, best.q, type);
  }

  function kickPass(p, q, type) {
    var dir = goalDir(p.side);
    var tx, ty, speed;
    var err = buffOf('tiki') > 0 ? 1.2 : (buffOf('build') > 0 ? 2.0 : 3.0);
    /* 감독 패스율 업·조직력 업: 패스 오차를 줄인다 */
    if (p.side === 'home') { err *= (1 - clamp(mfx('pass') * 0.05 + mfx('org') * 0.015, 0, 0.55)); }
    if (type === 'through') {
      tx = clamp(q.x + (q.baseX < 50 ? 2 : -2) + range(-err, err), q.zone.xMin, q.zone.xMax);
      ty = clamp(q.y + dir * 11, q.zone.yMin, q.zone.yMax);
      q.throughRun = { x: tx, y: ty, t: 1.8 };
      bubble(p, '⚡ 스루패스!', '#9ff0c4', 1.3);
    } else if (type === 'cross') {
      tx = clamp(50 + (q.baseX - 50) * 0.3 + range(-4, 4), 34, 66);
      ty = attackGoalY(p.side) - dir * 12;
      q.throughRun = { x: tx, y: ty, t: 1.6 };
      bubble(p, '🎯 크로스!', '#ffd98a', 1.3);
      say(U.josa(short(p.name), '이/가') + ' 측면에서 크로스를 올립니다!', 'normal');
    } else if (type === 'switch') {
      tx = clamp(q.x + q.vx * 0.4 + range(-err, err), 4, 96);
      ty = clamp(q.y + q.vy * 0.4 + range(-err, err), 4, 116);
      bubble(p, '↔ 전환 패스!', '#9fd8ff', 1.2);
    } else {
      tx = clamp(q.x + q.vx * 0.22 + range(-err, err) * 0.5, 3, 97);
      ty = clamp(q.y + q.vy * 0.22 + range(-err, err) * 0.5, 3, 117);
      if (buffOf('tiki') > 0 && chance(0.5)) { bubble(p, '👟 원투패스!', '#8ff0b6', 1.1); }
    }
    /* v15 — 가끔 패스가 터치라인을 넘어간다 → 실제 스로인으로 이어진다 */
    if ((type === 'switch' || type === 'progressive' || type === 'cross') && chance(0.07)) {
      tx = tx < 50 ? -1.6 : WORLD_W + 1.6;
    }
    var dist = Math.hypot(tx - p.x, ty - p.y);
    speed = clamp(dist * 2.15, 30, 66) * (buffOf('tiki') > 0 ? 1.12 : 1);
    /* v14 계측: 패스 종류별 카운트 */
    var bucket = type === 'through' ? 'through' : (type === 'cross' ? 'cross' : (type === 'switch' ? 'switch' : (dist > 25 ? 'long' : 'short')));
    if (tele.pass[p.side]) { tele.pass[p.side][bucket] += 1; }
    if (tele.passDist[p.side]) { tele.passDist[p.side].sum += dist; tele.passDist[p.side].n += 1; }
    /* v15 — 패스 출발 순간 오프사이드 판정 (스로인·골킥·코너 재개 패스는 면제) */
    if (ball.exempt) { ball.exempt = false; }
    else {
      var ofs = offsideCheck(q);
      if (v15) { v15.chk = (v15.chk || 0) + 1; if (ofs) { v15.behind = (v15.behind || 0) + 1; } }
      if (ofs) { flagOffside(q, ofs); }
    }
    ball.x = p.x;
    ball.y = p.y + goalDir(p.side) * 0.8;
    kickBall(p, tx, ty, speed, 'pass', q, type === 'short' ? 0 : 1);
    setPose(p, type === 'cross' || type === 'through' ? 'kick' : 'pass', 0.28);
    fxRing(p, type === 'through' ? '#9ff0c4' : (type === 'cross' ? '#ffd98a' : '#c8f169'), 0.62);
    fxPop(p, 0.22);
    ball.assist = p;
    stats.passes++;
    if (p.side === 'home') { charge(0.5 + (buffOf('tiki') > 0 ? 0.35 : 0) + (buffOf('build') > 0 ? 0.3 : 0)); }
    play.passLine = {
      x1: p.x, y1: p.y, x2: tx, y2: ty, t: 0.7, t0: 0.7,
      color: type === 'through' ? '#9ff0c4' : (type === 'cross' ? '#ffd98a' : '#c8f169')
    };
    if (chance(0.28)) {
      say(pick([
        U.josa(short(p.name), '이/가') + ' 간결하게 연결합니다.',
        U.josa(short(p.name), '의') + ' 정확한 전진 패스!',
        '패스 한 번에 수비 라인이 흔들립니다!',
        type === 'through' ? '수비 뒷공간으로 날카로운 스루패스!' : '중원에서 볼이 돌아갑니다.'
      ]), 'normal');
    }
    return true;
  }

  function dribble(p) {
    var dir = goalDir(p.side);
    var opp = nearestOpponent(p, 9);
    var side = opp.player ? (p.x >= opp.player.x ? 1 : -1) : (chance(0.5) ? 1 : -1);
    p.dribbleX = p.x + side * range(3, 8);
    p.dribbleY = p.y + dir * range(6, 12);
    p.dribbleT = 0.55;
    if (chance(0.5)) { bubble(p, '💨 돌파!', '#ffe28a', 1.0); }
    p.kind = 'dribble';
  }

  /* 압박을 받을 때 안전한 백패스/원터치 옵션 */
  function backPass(p) {
    var dir = goalDir(p.side), best = null, bv = -1, i, q, d, back, open, v;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 6 || d > 24) { continue; }
      back = (q.y - p.y) * dir;                 /* 뒤쪽 = 음수 */
      open = nearestOpponent(q, 22).dist;
      v = open * 1.4 - Math.abs(d - 12) * 0.5 + (back < 0 ? 8 : 0) - back * 0.2;
      if (v > bv) { bv = v; best = q; }
    }
    if (!best || bv < 6) { return false; }
    return kickPass(p, best, 'short');
  }

  function decide() {
    var p = ball.carrier;
    if (!p) { return; }
    var dist = Math.abs(p.y - attackGoalY(p.side));
    var opp = nearestOpponent(p, 40);
    var pressure = opp.player ? opp.dist : 40;
    var tac = p.side === 'home' ? tactic : 'balanced';
    var sty = styleOf(p.side);
    var shootRange = 22 + (tac === 'attack' ? 4 : 0) + (p.side === 'home' && buffOf('longshot') > 0 ? 12 : 0) + (sty.shootBias - 1) * 14;
    if (p.side === 'home' && buffOf('atk') > 0) { shootRange += 2; }

    /* 1) 슛 */
    if (dist < shootRange) {
      var pShot = dist < 12 ? 0.52 : (dist < 18 ? 0.36 : 0.22);
      pShot *= sty.shootBias;
      if (pressure < 2.2 && dist > 10) { pShot *= 0.45; }
      if (p.side === 'home' && (buffOf('atk') > 0 || buffOf('longshot') > 0)) { pShot += 0.12; }
      if (chance(pShot)) { shoot(p, dist); return; }
    }
    /* 1.5) 원터치 — 압박이 강하면 무작정 뺏기지 않고 가까운 동료에게 넘긴다 */
    if (pressure - (sty.shortBias > 0 ? 0.6 : 0) < 3.4 && chance(0.55 + clamp(sty.shortBias * 0.09, 0, 0.25))) {
      if (backPass(p)) { actionTimer = 0.14; return; }
    }

    /* 2) 측면 크로스 · 컷백 — 크로스 성향이 강한 감독은 더 넓고 더 자주 올린다 */
    if ((play.stage === 'wide' || play.stage === 'final') && (p.x < 22 + (sty.crossBias - 1) * 6 || p.x > 78 - (sty.crossBias - 1) * 6) && dist < 34 + Math.max(0, sty.crossBias - 1) * 4) {
      var box = bestBoxTarget(p.side);
      if (box && dist < 28 + Math.max(0, sty.crossBias - 1) * 4 && chance(clamp(0.72 * sty.crossBias, 0.18, 0.98))) {
        bubble(p, p.x < 22 ? '→ 컷백!' : '← 컷백!', '#ffd98a', 1.2);
        if (kickPass(p, box, 'cross')) { return; }
      }
      if (passBall(p)) { return; }
    }
    /* 3) 패스 */
    if (pressure < 6 || chance(0.72)) {
      if (passBall(p)) { return; }
    }
    /* 4) 드리블 */
    dribble(p);
  }

  function shoot(p, dist) {
    var gy = attackGoalY(p.side);
    var longshot = dist > 19 || (p.side === 'home' && buffOf('longshot') > 0);
    var acc = 0.46 + p.player.stats.atk / 520 + (p.side === 'home' ? (formFactor - 1) * 0.9 : 0);
    if (p.side === 'home' && (buffOf('atk') > 0 || buffOf('longshot') > 0)) { acc += 0.09; }
    if (p.side === 'home') { acc += mfx('shoot') * 0.008 + mfx('atk') * 0.004; }
    acc -= dist * 0.005;
    var onTarget = chance(clamp(acc, 0.2, 0.86));
    var xg = clamp(0.32 * Math.exp(-dist / 11) + p.player.stats.atk / 2600, 0.02, 0.42);
    if (p.side === 'home' && buffOf('atk') > 0) { xg += 0.05; }
    if (p.side === 'home' && buffOf('longshot') > 0 && dist > 19) { xg += 0.035; }
    if (p.side === 'away' && buffOf('def') > 0) { xg -= 0.045; }
    if (p.side === 'home') { xg += mfx('shoot') * 0.004 + mfx('atk') * 0.002; }
    else { xg -= mfx('def') * 0.005 + mfx('press') * 0.001; }
    if (!onTarget) { xg *= 0.12; }
    var isGoal = chance(clamp(xg, 0.01, 0.66));
    var tx = onTarget ? clamp(50 + range(-8, 8), 38, 62) : (chance(0.5) ? range(28, 42) : range(58, 72));
    var travel = Math.hypot(tx - p.x, gy - p.y);
    var sdur = clamp(travel / 46, 0.34, 0.95);      /* v15 — 슛 궤적이 눈으로 읽히게 */
    var speed = travel / sdur;

    ball.x = p.x;
    ball.y = p.y;
    kickBall(p, tx, gy, speed, 'shot', null, longshot ? 1 : 0);
    ball.dur = sdur;
    if (longshot) { ball.vz = BALL_G * ball.dur * 0.46; ball.z = 1.0; }
    ball.shot = {
      by: p, xg: xg, onTarget: onTarget, isGoal: isGoal,
      long: longshot, tx: tx, gy: gy
    };
    M.phase = 'shot';
    if (p.side === 'home') {
      goalStats.homeShots++;
      homeXg += xg;
      charge(1.8);
    } else {
      goalStats.awayShots++;
      awayXg += xg;
    }
    setPose(p, 'kick', 0.38);
    fxRing(p, longshot ? '#ffb066' : '#ffe28a', 0.95);
    kickCam(longshot ? 1.4 : 1.0, 0.16);
    fxPop(p, 0.34);
    bubble(p, longshot ? '🔥 중거리 슛!' : '🎯 슛!', longshot ? '#ffb066' : '#ffe28a', 1.3);
    say(U.josa(short(p.name), '이/가') + ' ' + (longshot ? '중거리에서 대포알을 때립니다!' : '과감하게 슛!') + ' ' +
      pick(['발끝에서 불꽃이 튑니다!', '골문을 향해 낮게 깔아 찹니다!', '수비수 머리 위로 감아 찹니다!', '있는 힘껏 때렸습니다!']), 'shot');
    var gk = goalkeeper(p.side === 'home' ? 'away' : 'home');
    if (gk) { gk.diveT = 0.55; gk.diveDir = (tx - gk.x) >= 0 ? 1 : -1; }
  }

  function resolveShot() {
    var s = ball.shot;
    ball.shot = null;
    if (!s) { ball.kind = 'idle'; return; }
    var p = s.by;
    var defSide = p.side === 'home' ? 'away' : 'home';
    var gk = goalkeeper(defSide);
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    if (gk) { gk.diveT = 0.7; gk.diveDir = (s.tx - gk.x) >= 0 ? 1 : -1; }
    if (s.isGoal) {
      goal(p, p.side);
      return;
    }
    if (!s.onTarget) {
      say('아쉽습니다! ' + U.josa(short(p.name), '의') + ' 슛이 골대를 벗어납니다.', 'miss');
      kickCam(0.7, 0.12);
      addRating(p, -0.04);
      goalKick(defSide);
      return;
    }
    if (gk) { save(gk); } else { stats.saves++; }
    addRating(p, -0.02);
    if (chance(0.3)) { doCorner(p.side); } else { goalKick(defSide); }
  }

  function save(gk) {
    stats.saves++;
    addRating(gk, 0.55);
    if (gk.side === 'home') { charge(2.2); }
    bubble(gk, '🧤 슈퍼 세이브!', '#9fe8ff', 1.6);
    fxRing(gk, '#9fe8ff', 1.15);
    kickCam(2.0, 0.26);
    fxPop(gk, 0.42);
    setSit('save', short(gk.name) + ' 선방', true);
    say('🧤 ' + U.josa(short(gk.name), '이/가') + ' 슈퍼 세이브! ' + pick([
      '새끼손가락으로 쳐냅니다!', '몸을 날려 막아냅니다!', '반사 신경이 미쳤습니다!', '골문을 닫아버립니다!'
    ]), 'save');
  }

  function goal(scorer, side) {
    var i;
    var mn = minute();
    var half = mn < 45 ? 0 : 1;
    if (side === 'home') {
      M.homeScore++;
      halfScore[half][0]++;
      addRating(scorer, 1.05);
      charge(14);
    } else {
      M.awayScore++;
      halfScore[half][1]++;
      for (i = 0; i < players.length; i++) {
        if (players[i].side === 'home' && (isGK(players[i]) || isDefGroup(players[i]))) { addRating(players[i], -0.12); }
      }
      charge(8);
    }
    lastScorerSide = side;
    var r = ratingOf(scorer);
    if (r) { r.goals++; }
    var assistName = '';
    var assister = ball.assist && ball.assist !== scorer ? ball.assist : null;
    if (side === 'home' && assister) {
      var ar = ratingOf(assister);
      if (ar) { ar.assists++; ar.rating = clamp(ar.rating + 0.55, 3.5, 10); assistName = assister.name; }
    }
    goals.push({ min: mn, half: half, side: side, name: scorer.name, assist: assistName });
    updateScoreboard();
    var isHome = side === 'home';
    setPose(scorer, 'celebrate', 2.4);
    fxRing(scorer, '#ffe98a', 1.35);
    kickCam(3.6, 0.36);
    flash.t = flash.t0;
    flash.side = side;
    flash.name = short(scorer.name);
    flash.score = M.homeScore + ' : ' + M.awayScore;
    fxPop(scorer, 0.5);
    bubble(scorer, '⚽ 골!', '#ffe98a', 1.8);
    banner('GOAL!', short(scorer.name) + (isHome ? ' · ' + cfg.homeName : ' · ' + cfg.awayName));
    bannerT = 3.4;
    dead(1.5);
    setSit('goal', short(scorer.name) + ' 득점', true);
    if (isHome) { goalCutin(scorer); }
    say((isHome ? '⚽ GOAL!! ' : '😱 실점... ') + U.josa(short(scorer.name), '이/가') + ' 골망을 흔듭니다! ' + pick([
      '관중석이 들썩입니다!', '완벽한 마무리였습니다!', '골키퍼가 손을 쓸 수 없었습니다!', '중계석도 목이 쉬겠습니다!'
    ]), 'goal');
    say(M.homeScore + ' : ' + M.awayScore + ' — ' + pick(['경기의 흐름이 바뀝니다!', '집중력이 필요합니다!', '아직 경기는 끝나지 않았습니다!']), 'normal');
    play.phase = 'goal';
    play.timer = 3.0;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.x = 50; ball.y = WORLD_H / 2;
  }

  function goalKick(side) {
    /* v15 — 골킥은 실제 위치에서: 골키퍼가 페널티 에어리어에서 차고 수비수가 벌린다 */
    doGoalKick(side);
  }

  function throwIn(side) {
    doThrowIn(side || (play.atkSide === 'home' ? 'away' : 'home'));
  }

  /* v15 — 아웃 오브 플레이: 라인과 마지막 터치로 스로인·코너킥·골킥을 가른다 */
  function outOfPlay(edge) {
    var last = ball.lastTouch || (ball.from ? ball.from.side : null) || play.atkSide;
    if (edge === 'x') {
      doThrowIn(last === 'home' ? 'away' : 'home');
      return;
    }
    var atk = edge === 'y0' ? 'home' : 'away';          /* y0 = 0 라인의 골문을 공격하는 팀은 홈 */
    var defending = atk === 'home' ? 'away' : 'home';
    if (last === atk) { doGoalKick(defending); }
    else { doCorner(atk); }
  }

  function settleBall() {
    var best = null, bd = 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].off) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    if (best && bd < 9) { giveBall(best); return; }
    /* 아무도 닿지 못한 패스 — 라인 밖이면 실제 재개(스로인·골킥·코너), 안이면 루즈볼 */
    if (ball.x < 1.5 || ball.x > WORLD_W - 1.5) {
      ball.kind = 'idle'; ball.vx = 0; ball.vy = 0; ball.flight = 0;
      outOfPlay('x');
      return;
    }
    if (ball.y < 1.5 || ball.y > WORLD_H - 1.5) {
      ball.kind = 'idle'; ball.vx = 0; ball.vy = 0; ball.flight = 0;
      outOfPlay(ball.y < 1.5 ? 'y0' : 'y120');
      return;
    }
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.flight = 0;
    play.looseT = 1.0;
  }

  function tryTackle(defender, carrier, dt) {
    /* v16 — 분리 최소 간격이 1.18 지름(29px)이 되면서 예전 월드 거리 5.2는 닿지 않는 거리가 됐다.
       화면에서 '어깨를 대는' 거리(1.30 지름)까지 허용하고, 성공 확률은 세트피스가
       마라톤이 되지 않도록 낮춘다. */
    var dpx = pxDist(defender.x, defender.y, carrier.x, carrier.y);
    var dLim = 2 * SPR_H * TOKEN_R * 1.30;
    if (dpx > dLim) { return; }
    if (tele.press[defender.side] !== undefined) {
      /* v14 계측: 같은 수비수가 같은 소유자에게 붙은 '압박 이벤트'만 센다 */
      if (!defender.lastPressT || simTime - defender.lastPressT > 0.7) {
        tele.press[defender.side] += 1;
        if (progressOf(defender.side, ball.y) > 0.45) { tele.pressHigh[defender.side] += 1; }
        if (tele.pressY[defender.side]) {
          tele.pressY[defender.side].sum += progressOf(defender.side, ball.y) * 100;
          tele.pressY[defender.side].n += 1;
        }
        defender.lastPressT = simTime;
      }
    }
    /* 가까울수록 성공 확률이 높다 (화면 거리 기준) */
    var near = clamp(1.18 - (dpx - dLim * 0.75) / (dLim * 0.75) * 0.80, 0.35, 1.18);
    var defSkill = defender.player.stats.def + 8 + (defender.side === 'home' && buffOf('press') > 0 ? 9 : 0);
    if (defender.side === 'home') { defSkill += mfx('def') * 1.2 + mfx('press') * 1.0; }
    var atkSkill = carrier.player.stats.spd * 0.7 + carrier.player.stats.atk * 0.3 + 12;
    var pT = clamp(0.85 * (defSkill / (defSkill + atkSkill)) * dt * 1.9 * near * 0.30, 0, 0.5);
    if (buffOf('press') > 0 && defender.side === 'home') { pT *= 1.45; }
    if (buffOf('tiki') > 0 && carrier.side === 'home') { pT *= 0.75; }
    if (!chance(pT)) { return; }
    doTackle(defender, carrier);
  }

  function doTackle(defender, carrier) {
    var progT = progressOf(carrier.side, carrier.y);
    var boxy = progT > 0.80 && Math.abs(carrier.x - 50) < 26;
    var foulP = clamp(0.20 + (defender.player.tough < 4 ? 0.05 : 0) + (boxy ? 0.06 : 0), 0.05, 0.34);
    if (chance(foulP)) {
      foul(defender, carrier);
      return;
    }
    stats.tackles++;
    addRating(defender, 0.18);
    addRating(carrier, -0.06);
    carrier.stun = 0.4;
    carrier.dribbleT = 0;
    setPose(defender, 'tackle', 0.52);
    fxRing(defender, buffOf('press') > 0 ? '#ff9f8a' : '#ffd98a', 0.78);
    fxPop(defender, 0.26);
    bubble(defender, buffOf('press') > 0 ? '🛡️ 압박!' : '🦵 태클!', buffOf('press') > 0 ? '#ff9f8a' : '#ffd98a', 1.2);
    giveBall(defender);
    if (defender.side === 'home') { charge(1.7); }
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 태클! ' + pick([
      '깔끔하게 공을 빼앗습니다!', '몸을 던져 길을 막습니다!', '주머니에 손 넣듯 빼앗아 갑니다!'
    ]), 'tackle');
  }

  function foul(defender, carrier) {
    var atk = carrier.side;
    var prog = progressOf(atk, carrier.y);
    /* v15 — 페널티 박스 안 반칙이면 PK */
    var inBox = prog > 0.80 && Math.abs(carrier.x - 50) < 26;
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 파울! 휘슬이 울립니다.', 'tackle');
    /* v15 — 다이렉트 레드 · 경고 누적: 위험 지역 반칙일수록 퇴장 확률이 높다 */
    var redP = inBox ? 0.10 : (prog > 0.70 ? 0.07 : 0.03);
    if (chance(redP)) { redCard(defender, inBox ? '박스 안 거친 반칙' : '위험한 반칙'); }
    else if (chance(0.34)) { caution(defender); }
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.x = carrier.x;
    ball.y = carrier.y;
    carrier.stun = 0;
    if (inBox) { doPenalty(atk); return; }
    if (prog > 0.5) { freeKick(atk, carrier.x, carrier.y); }
    else { giveBall(carrier); }
  }

  function caution(p) {
    p.yellows = (p.yellows || 0) + 1;
    if (v15) { v15.cards += 1; }
    if (p.yellows >= 2) {
      cautions.push({
        min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name, type: 'red'
      });
      say('🟨🟨 ' + U.josa(short(p.name), '이/가') + ' 경고 누적으로 퇴장! 수적 열세입니다.', 'tackle');
      redCard(p, '경고 누적', true);
    } else {
      cautions.push({
        min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name, type: 'yellow'
      });
      say('🟨 ' + U.josa(short(p.name), '에게') + ' 경고 카드가 주어집니다.', 'tackle');
      addRating(p, -0.2);
      dead(0.8);
    }
  }

  /* v15 — 퇴장: 선수를 실제로 피치에서 제거해 10명 대 11명으로 경기가 이어진다 */
  function redCard(p, reason, secondYellow) {
    if (!p || p.off) { return; }
    p.off = true;
    if (v15) { v15.reds += 1; }
    logEvt('red', p.side, p.x, p.y);
    var i = players.indexOf(p);
    if (i >= 0) { players.splice(i, 1); }
    if (ball.carrier === p) { ball.carrier = null; ball.kind = 'idle'; ball.x = p.x; ball.y = p.y; }
    var r = ratingOf(p);
    if (r) { r.rating = clamp(r.rating - 1.4, 3.5, 10); }
    for (i = 0; i < players.length; i++) { if (players[i].mark === p) { players[i].mark = null; } }
    var wasGK = isGK(p);
    if (wasGK) { coverGK(p.side); }
    banner('🟥 퇴장!', short(p.name) + ' · ' + reason);
    bannerT = 2.0;
    setSit('red', short(p.name) + ' 퇴장 · ' + (p.side === 'home' ? '우리 10명' : '상대 10명'), true);
    say('🟥 ' + U.josa(short(p.name), '이/가') + ' 퇴장! ' + reason + ' — ' +
      (p.side === 'home' ? cfg.homeShort : cfg.awayShort) + '가 10명으로 뛰어야 합니다.', 'tackle');
    if (secondYellow) { say('경고 2장이 쌓였습니다.', 'normal'); }
    dead(1.6);
  }

  /* 골키퍼가 퇴장당하면 수비수 한 명이 장갑을 낀다 */
  function coverGK(side) {
    if (goalkeeper(side)) { return; }
    var best = null, bd = 1e9, i, p, d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      d = Math.abs(p.y - ownGoalY(side));
      if (isDefGroup(p)) { d -= 9; }
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { return; }
    best.pos = 'GK';
    best.role = 'GK';
    best.zone = zoneFor('GK', best.baseY, side);
    say('🧤 ' + U.josa(short(best.name), '이/가') + ' 골키퍼 장갑을 낍니다!', 'tactic');
  }

  /* ─────────────────────────  세트피스  ───────────────────────── */
  function bestTaker(side, key) {
    var best = null, bv = -1, i, p, v;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      v = (p.player.set && p.player.set[key]) || 5;
      if (v > bv) { bv = v; best = p; }
    }
    return best;
  }
  function bestBoxTarget(side) {
    var best = null, bv = -1, onBest = null, onV = -1, i, p, v;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      v = p.player.stats.atk + (isFwdGroup(p) ? 20 : 0);
      if (v > bv) { bv = v; best = p; }
      /* v15 — 오프사이드 위치에 서 있지 않은 박스 타깃을 우선한다 (크로스 타이밍) */
      if (!isOffsidePos(p) && v > onV) { onV = v; onBest = p; }
    }
    return onBest || best;
  }

  /* ───────────── v15 세트피스: 실제 규칙 위치에서 재개 ───────────── */
  function teamShort(side) { return side === 'home' ? cfg.homeShort : cfg.awayShort; }

  function sendTo(p, x, y) {
    if (!p) { return; }
    p.setPos = { x: clamp(x, 2, WORLD_W - 2), y: clamp(y, 2, WORLD_H - 2) };
    p.tx = p.setPos.x; p.ty = p.setPos.y;
  }
  function clearSetPos() {
    for (var i = 0; i < players.length; i++) { players[i].setPos = null; }
  }

  function beginSetpiece(type, side, hold) {
    play.phase = 'setpiece';
    play.setpiece = { type: type, side: side, t: hold };
    play.atkSide = side;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    ball.from = null;
    ball.receiver = null;
    ball.offside = null;
    ball.exempt = false;
    actionTimer = hold + 0.2;
    if (v15 && v15.setpiece[type] !== undefined) { v15.setpiece[type] += 1; }
    logEvt('set:' + type, side, ball.x, ball.y);
    dead(hold * 0.45);
  }

  /* 스로인 — 터치라인 밖으로 나간 지점에서 가장 가까운 선수가 라인 밖에서 던진다 */
  function doThrowIn(side) {
    var x = clamp(ball.x, 4, 96), y = clamp(ball.y, 6, 114);
    var left = x < 50;
    var dir = goalDir(side);
    clearSetPos();
    ball.x = left ? 1.4 : WORLD_W - 1.4;
    ball.y = y;
    var taker = nearestNToBall(side, 4)[0] || nearestToBall(side, 999);
    if (taker && isGK(taker)) { taker = nearestNToBall(side, 2)[1] || taker; }
    if (taker) { sendTo(taker, left ? 1.2 : WORLD_W - 1.2, y); }
    /* 주변 동료가 라인 안쪽으로 받으러 온다 */
    var recv = nearestNToBall(side, 3), k = 0, i, p;
    for (i = 0; i < recv.length; i++) {
      p = recv[i];
      if (p === taker || isGK(p)) { continue; }
      k++;
      sendTo(p, left ? clamp(6 + k * 6, 6, 32) : clamp(94 - k * 6, 68, 94), clamp(y + dir * (k === 1 ? 5 : -4), 6, 114));
    }
    beginSetpiece('throw', side, 1.1);
    play.stage = 'mid';
    setSit('throw', teamShort(side) + ' 스로인', true);
    say('🙌 터치라인 밖으로 — ' + teamShort(side) + ' 스로인으로 경기가 재개됩니다.', 'normal');
  }

  /* 골킥 — 골키퍼가 페널티 에어리어에서 차고, 수비수들이 양옆으로 벌린다 */
  function doGoalKick(side) {
    var dir = goalDir(side);
    var gk = goalkeeper(side);
    var spotY = ownGoalY(side) + dir * 6.2;
    clearSetPos();
    ball.x = 50; ball.y = spotY;
    if (gk) { sendTo(gk, 50, spotY); }
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p === gk) { continue; }
      if (p.side === side) {
        if (p.pos === 'CB') { sendTo(p, p.baseX < 50 ? 24 : 76, spotY + dir * 5); }
        else if (p.pos === 'LB' || p.pos === 'LWB') { sendTo(p, 8, spotY + dir * 17); }
        else if (p.pos === 'RB' || p.pos === 'RWB') { sendTo(p, 92, spotY + dir * 17); }
        else if (p.pos === 'DM') { sendTo(p, 50 + (p.baseX < 50 ? -7 : 7), spotY + dir * 11); }
      } else if (isFwdGroup(p)) {
        /* 상대 최전방은 하프라인 근처까지 올라와 압박을 준비 */
        sendTo(p, clamp(50 + (p.baseX - 50) * 0.75, 22, 78), spotY + dir * 36);
      }
    }
    beginSetpiece('goalkick', side, 1.7);
    play.stage = 'build';
    setSit('goalkick', teamShort(side) + ' 골킥', true);
    say('🧤 골킥 — ' + teamShort(side) + ' 골키퍼가 페널티 에어리어에서 차서 재개합니다.', 'normal');
  }

  function doCorner(side) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    var left = ball.x < 50;
    clearSetPos();
    ball.x = left ? 2.4 : WORLD_W - 2.4;
    ball.y = side === 'home' ? 2.2 : WORLD_H - 2.2;
    var taker = bestTaker(side, 'ck');
    if (taker) { sendTo(taker, left ? 4.6 : 95.4, side === 'home' ? 3.2 : WORLD_H - 3.2); }
    var atkList = [], defList = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || isGK(p) || p === taker) { continue; }
      if (p.side === side) { atkList.push(p); } else { defList.push(p); }
    }
    atkList.sort(function (a, b) { return (isFwdGroup(b) ? 1 : 0) - (isFwdGroup(a) ? 1 : 0); });
    defList.sort(function (a, b) { return Math.abs(a.y - gy) - Math.abs(b.y - gy); });
    /* v16 — 박스 인원을 3×3 격자에 앉힌다. 토큰 지름(28px) + 18% 간격을 화면에서 지키려면
       가로 15단위·깊이 5.5단위가 필요하다. (골키퍼가 서는 50·6 자리는 비워 둔다) */
    var atkSlots = [[33, 8.5], [67, 8.5], [50, 14], [50, 19.5]];
    var defSlots = [[33, 14], [67, 14], [33, 19.5], [67, 19.5]];
    for (i = 0; i < atkList.length && i < atkSlots.length; i++) {
      sendTo(atkList[i], atkSlots[i][0], gy - dir * atkSlots[i][1]);
    }
    for (i = 0; i < defList.length && i < defSlots.length; i++) {
      sendTo(defList[i], defSlots[i][0], gy - dir * defSlots[i][1]);
    }
    /* 나머지는 박스 바깥(아크·측면)에서 대기해 박스가 넘치지 않게 */
    for (i = atkSlots.length; i < atkList.length; i++) {
      sendTo(atkList[i], 50 + ((i % 2) ? 12 : -12), gy - dir * (22 + (i % 3) * 5));
    }
    for (i = defSlots.length; i < defList.length; i++) {
      sendTo(defList[i], 50 + ((i % 2) ? 14 : -14), gy - dir * (21 + (i % 3) * 6));
    }
    void 0;
    var gk = goalkeeper(side === 'home' ? 'away' : 'home');
    if (gk) { sendTo(gk, left ? 47 : 53, gy - dir * 2.6); }
    beginSetpiece('corner', side, 2.4);
    play.stage = 'final';
    setSit('corner', teamShort(side) + ' 코너킥', true);
    say('🚩 코너킥! ' + teamShort(side) + ' — 박스 안에 양 팀 선수들이 헤더 경합 대형으로 모입니다.', 'tactic');
  }

  function freeKick(side, spotX, spotY, indirect) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    if (typeof spotX === 'number') { ball.x = spotX; }
    if (typeof spotY === 'number') { ball.y = spotY; }
    ball.x = clamp(ball.x, 8, 92);
    ball.y = clamp(ball.y, 8, 112);
    clearSetPos();
    var taker = bestTaker(side, indirect ? 'pk' : 'fk');
    if (taker) { sendTo(taker, ball.x + (ball.x < 50 ? 1.5 : -1.5), ball.y - dir * 3.4); }
    /* 수비벽 — 공과 골문 사이에 3명이 벽을 세운다 */
    var dx = 50 - ball.x, dy = gy - ball.y;
    var len = Math.max(1, Math.hypot(dx, dy));
    var wx = ball.x + dx / len * 9.6, wy = ball.y + dy / len * 9.6;
    var px = -dy / len, py = dx / len;
    var wall = [], i, q;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === side || q.off || isGK(q)) { continue; }
      wall.push(q);
    }
    wall.sort(function (a, b) { return Math.abs(a.y - wy) - Math.abs(b.y - wy); });
    for (i = 0; i < wall.length && i < 3; i++) {
      var off = (i - 1) * 3.1;
      sendTo(wall[i], clamp(wx + px * off, 4, 96), clamp(wy + py * off, 4, 116));
    }
    var gk = goalkeeper(side === 'home' ? 'away' : 'home');
    if (gk) { sendTo(gk, clamp(50 + (ball.x - 50) * 0.18, 42, 58), gy - dir * 1.6); }
    beginSetpiece(indirect ? 'indirect' : 'fk', side, indirect ? 1.6 : 2.1);
    setSit('fk', teamShort(side) + (indirect ? ' 간접 프리킥' : ' 프리킥'), true);
    var dg = Math.abs(ball.y - gy);
    say('🎯 ' + teamShort(side) + (indirect ? ' 간접 프리킥' : ' 프리킥') + ' — ' +
      (wall.length ? '수비벽 ' + Math.min(3, wall.length) + '명이 섰습니다. ' : '') +
      (!indirect && dg < 30 ? '직접 슛 각도입니다!' : '박스로 크로스를 올릴 수 있습니다.'), 'tactic');
  }

  /* 페널티킥 — 키커 vs 골키퍼 1:1 */
  function doPenalty(side) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    clearSetPos();
    ball.x = 50;
    ball.y = gy - dir * 11;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.shot = null;
    var taker = bestTaker(side, 'pk');
    if (taker) { sendTo(taker, 50, ball.y - dir * 3.6); }
    var gk = goalkeeper(side === 'home' ? 'away' : 'home');
    if (gk) { sendTo(gk, 50, gy - dir * 1.3); }
    var i, p, k = 0;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p === taker || p === gk) { continue; }
      sendTo(p, clamp(26 + (k * 8) % 44, 24, 76), gy - dir * 21);
      k++;
    }
    beginSetpiece('pk', side, 2.9);
    setSit('pk', teamShort(side) + ' 페널티킥', true);
    banner('페널티킥', (taker ? short(taker.name) : '') + (gk ? ' vs ' + short(gk.name) : ''));
    bannerT = 1.6;
    say('⚽ 페널티킥 선언! ' + (taker ? U.josa(short(taker.name), '이/가') : '키커가') + ' 공을 세팅하고 ' +
      (gk ? short(gk.name) : '골키퍼') + ' 골키퍼와 1:1로 맞섭니다.', 'tactic');
    dead(2.0);
  }

  function executeSetpiece(sp) {
    play.phase = 'play';
    play.setpiece = null;
    clearSetPos();
    var side = sp.side;
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    var taker = bestTaker(side, sp.type === 'corner' ? 'ck' : (sp.type === 'pk' ? 'pk' : 'fk'));
    var scorer = bestBoxTarget(side);
    var dist = Math.abs(ball.y - gy);
    var xg, tx, ty, dur, speed, by;

    /* 스로인 · 골킥: 던지거나 차서 동료에게 연결한다 (오프사이드 면제) */
    if (sp.type === 'throw' || sp.type === 'goalkick') {
      var passer = sp.type === 'goalkick' ? (goalkeeper(side) || taker) : taker;
      var target = null, bv = -1e9, i, q, d, open, v;
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.side !== side || q === passer || q.off || isGK(q)) { continue; }
        d = Math.hypot(q.x - ball.x, q.y - ball.y);
        if (d > (sp.type === 'goalkick' ? 46 : 30)) { continue; }
        open = nearestOpponent(q, 22).dist;
        v = open * 1.5 - d * 0.55 + (isMidGroup(q) ? 6 : 0) + (isDefGroup(q) && sp.type === 'goalkick' ? 5 : 0);
        if (v > bv) { bv = v; target = q; }
      }
      if (passer && target) {
        ball.exempt = true;                 /* 스로인·골킥 재개 패스는 오프사이드 없음 */
        ball.x = passer.x; ball.y = passer.y;
        kickPass(passer, target, 'progressive');
        bubble(passer, sp.type === 'goalkick' ? '🥾 골킥!' : '🙌 스로인!', '#bfe8ff', 1.2);
        say(sp.type === 'goalkick'
          ? short(passer.name) + '의 골킥이 ' + short(target.name) + '에게 연결됩니다.'
          : U.josa(short(passer.name), '의') + ' 스로인 — ' + U.josa(short(target.name), '이/가') + ' 받습니다.', 'normal');
      } else {
        var fallback = target || nearestToBall(side, 999);
        if (fallback) { giveBall(fallback); }
      }
      return;
    }

    /* 간접 프리킥: 골문을 직접 노리지 않고 연결한다 */
    if (sp.type === 'indirect') {
      var opt = null, ov = -1e9, j, r, dr, opn, vv;
      for (j = 0; j < players.length; j++) {
        r = players[j];
        if (r.side !== side || r === taker || r.off || isGK(r)) { continue; }
        dr = Math.hypot(r.x - ball.x, r.y - ball.y);
        if (dr < 4 || dr > 32) { continue; }
        opn = nearestOpponent(r, 20).dist;
        vv = opn * 1.6 - dr * 0.4 + (isMidGroup(r) ? 5 : 0);
        if (vv > ov) { ov = vv; opt = r; }
      }
      if (opt && taker) {
        ball.exempt = false;
        ball.x = taker.x; ball.y = taker.y;
        kickPass(taker, opt, 'progressive');
        bubble(taker, '↔ 간접 프리킥', '#bfe8ff', 1.2);
        say('간접 프리킥 — ' + U.josa(short(taker.name), '이/가') + ' ' + short(opt.name) + '에게 내줍니다.', 'normal');
      } else if (opt) { giveBall(opt); }
      return;
    }

    ball.exempt = false;

    if (sp.type === 'corner') {
      tx = clamp(50 + range(-6, 6), 36, 64);
      ty = gy - dir * 11;
      xg = 0.12 + (side === 'home' && buffOf('setpiece') > 0 ? 0.05 : 0);
      if (side === 'home') { xg += mfx('jump') * 0.006; }
      else { xg -= mfx('def') * 0.003 + mfx('jump') * 0.003; }
      dur = 1.0;
      by = scorer || taker;
      bubble(taker || scorer, '🚩 코너 크로스!', '#ffd98a', 1.3);
      say('코너킥 크로스가 박스로 향합니다 — 헤딩 경합!', 'shot');
    } else if (sp.type === 'pk') {
      tx = clamp(50 + range(-4, 4), 42, 58);
      ty = gy;
      xg = 0.74;
      dur = 0.62;
      by = taker || scorer;
      say('⚽ 키커가 달려들어 찹니다!', 'shot');
    } else {
      var direct = dist < 30;
      xg = direct ? 0.11 + ((taker && taker.player.set.fk) || 5) / 260 : 0.09;
      tx = direct ? clamp(50 + range(-7, 7), 38, 62) : clamp(50 + range(-6, 6), 36, 64);
      ty = direct ? gy : gy - dir * 10;
      dur = direct ? 0.7 : 1.0;
      by = taker || scorer;
      bubble(taker || scorer, direct ? '🔥 직접 슛!' : '🎯 세트피스 크로스!', '#ffb066', 1.3);
      if (side === 'home' && buffOf('setpiece') > 0) { xg += 0.05; }
      say(direct ? '프리킥 — 직접 골문을 노립니다!' : '프리킥 크로스가 박스로 올라갑니다!', 'shot');
    }

    speed = clamp(Math.hypot(tx - ball.x, ty - ball.y) / dur, 16, 140);
    var originX = ball.x, originY = ball.y;
    ball.x = originX; ball.y = originY;
    if (by) { by.x = originX; by.y = originY + dir * 0.6; }
    if (by) { separate(); }      /* v16 — 키커를 공 위치로 순간이동시킨 뒤 인접 선수와 겹치지 않게 */
    kickBall(by, tx, ty, speed, 'shot', null, 1);
    ball.dur = dur;
    var onT = 0.55 + (side === 'home' ? mfx('jump') * 0.01 : 0) - (side === 'away' ? mfx('def') * 0.006 : 0);
    if (sp.type === 'pk') { onT = 0.90; }
    ball.shot = {
      by: by, xg: xg, onTarget: chance(clamp(onT, 0.2, 0.94)), isGoal: chance(clamp(xg, 0.02, 0.8)),
      long: dist > 26, tx: tx, gy: gy
    };
    if (sp.type === 'pk') {
      var gkPk = goalkeeper(side === 'home' ? 'away' : 'home');
      if (gkPk) { gkPk.diveT = 0.7; gkPk.diveDir = (tx - gkPk.x) >= 0 ? 1 : -1; }
      if (by) { setPose(by, 'kick', 0.42); }
    }
    if (side === 'home') { goalStats.homeShots++; homeXg += xg; charge(1.2); }
    else { goalStats.awayShots++; awayXg += xg; }
  }

  /* ─────────────────────────  리셋  ───────────────────────── */
  function resetKickoff(side) {
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.x = p.baseX; p.y = p.baseY; p.tx = p.baseX; p.ty = p.baseY;
      p.stun = 0; p.diveT = 0; p.bubble = null; p.throughRun = null;
      p.mark = null; p.dribbleT = 0; p.setPos = null;
    }
    ball.x = 50; ball.y = WORLD_H / 2; ball.vx = 0; ball.vy = 0;
    ball.carrier = null; ball.from = null; ball.receiver = null;
    ball.kind = 'idle'; ball.shot = null; ball.trail = [];
    ball.offside = null; ball.exempt = false;
    var starter = null;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === side && isMidGroup(players[i]) && !isGK(players[i])) { starter = players[i]; break; }
    }
    if (!starter) {
      for (i = 0; i < players.length; i++) {
        if (players[i].side === side && !isGK(players[i])) { starter = players[i]; break; }
      }
    }
    if (starter) {
      starter.x = 50; starter.y = WORLD_H / 2 + goalDir(side) * 4;
      giveBall(starter);
    }
    play.phase = 'play';
    play.stage = 'build';
    play.stageT = 0;
    play.atkSide = side;
    play.counterT = 0;
    play.recoverT = 0;
    M.phase = 'play';
  }

  /* ─────────────────────────  메인 루프  ───────────────────────── */
  function loop(t) {
    if (!M.running) { return; }
    if (!lastT) { lastT = t; }
    var realDt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (artGateOn) {
      artGateT += realDt;
      if (headLeft <= 0 || artGateT > 9) {
        artGateOn = false;
        M.paused = false;
        acc = 0;
        say('선수단 입장 완료! 양 팀 22명이 피치에 섰습니다.', 'big');
      }
    }
    if (!M.paused) {
      var dt = realDt * M.speed;
      acc += dt;
      var stepDt = 1 / 60, guard = 0;
      while (acc >= stepDt && guard < 14) { step(stepDt); acc -= stepDt; guard++; }
    }
    draw();
    if (M.running) { rafId = requestAnimationFrame(loop); }
  }

  function step(dt) {
    if (M.phase === 'ended') { return; }
    if (cutinHold > 0) { cutinHold -= dt; return; }

    var i;
    for (i = 0; i < hand.length; i++) { if (hand[i].readyAt > 0) { hand[i].readyAt -= dt; hudDirty = true; } }
    for (var k in buffs) {
      if (buffs.hasOwnProperty(k) && buffs[k] > 0) {
        buffs[k] -= dt;
        if (buffs[k] <= 0) { buffs[k] = 0; hudDirty = true; }
      }
    }
    momentum = clamp(momentum + dt * 0.42, 0, 100);
    if (autoCards) {
      autoT -= dt;
      if (autoT <= 0) { autoT = 8; tryAutoCard(); }
    }
    play.runT -= dt;
    if (play.runT <= 0) {
      var shp = shapeOf(play.atkSide);
      play.runT = shp.runMin + Math.random() * (shp.runMax - shp.runMin);
      assignRuns(shp.runs);
    }
    if (play.counterT > 0) { play.counterT -= dt; }
    if (play.recoverT > 0) { play.recoverT -= dt; }
    if (play.markT > 0) { play.markT -= dt; }
    if (play.passLine) {
      play.passLine.t -= dt;
      if (play.passLine.t <= 0) { play.passLine = null; }
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t >= ripples[i].t0) { ripples.splice(i, 1); }
    }
    if (shake.t > 0) { shake.t -= dt; if (shake.t < 0) { shake.t = 0; } }
    if (flash.t > 0) { flash.t -= dt; if (flash.t < 0) { flash.t = 0; } }
    if (flagShow.t > 0) { flagShow.t -= dt; if (flagShow.t < 0) { flagShow.t = 0; } }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { bannerT = 0; clearBanner(); } }
    for (i = 0; i < players.length; i++) {
      var pp = players[i];
      if (pp.popT > 0) { pp.popT -= dt; if (pp.popT < 0) { pp.popT = 0; } }
      if (pp.bubble) { pp.bubble.t -= dt; if (pp.bubble.t <= 0) { pp.bubble = null; } }
      if (pp.skillT > 0) { pp.skillT -= dt; }
      if (pp.glow > 0) { pp.glow -= dt; }
      if (pp.diveT > 0) { pp.diveT -= dt; }
      if (pp.poseT > 0) { pp.poseT -= dt; if (pp.poseT <= 0) { pp.pose = null; } }
      if (pp.dribbleT > 0) { pp.dribbleT -= dt; }
      if (pp.throughRun) { pp.throughRun.t -= dt; if (pp.throughRun.t <= 0) { pp.throughRun = null; } }
      if (pp.supportT > 0) { pp.supportT -= dt; }
      if (pp.runT > 0) { pp.runT -= dt; }
    }

    /* 골 세리머니 */
    if (play.phase === 'goal') {
      play.timer -= dt;
      updateTargets(dt);
      for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
      separate();
      if (play.timer <= 0) {
        var el = document.getElementById('m-banner');
        if (el) { el.classList.remove('on'); }
        resetKickoff(lastScorerSide === 'home' ? 'away' : 'home');
      }
      return;
    }

    simTime += dt;
    M.clock = Math.min(90, simTime / PER_MIN);

    /* v15 — 45분·90분에 그 하프에 쌓인 지연 시간으로 추가시간 결정 (45+1′~5′ · 90+2′~6′) */
    if (!addedDecided.first && simTime >= 45 * PER_MIN) {
      addedDecided.first = true;
      addedTime.first = clamp(Math.round(deadTime / (PER_MIN * 4)), 1, 3);
      if (v15) { v15.added[0] = addedTime.first; }
      say('📋 전반 추가시간 ' + addedTime.first + '분!', 'tactic');
    }
    if (halftimeDone && !addedDecided.second && simTime >= 90 * PER_MIN) {
      addedDecided.second = true;
      addedTime.second = clamp(Math.round(deadTime / (PER_MIN * 4)), 2, 4);
      if (v15) { v15.added[1] = addedTime.second; }
      say('📋 후반 추가시간 ' + addedTime.second + '분!', 'tactic');
    }
    if (Math.floor(simTime * 2) % 2 === 0) { updateScoreboard(); }

    if (!halftimeDone && simTime >= (45 + addedTime.first) * PER_MIN) {
      halftimeDone = true;
      M.paused = true;
      M.halftime = true;
      for (var hi = 0; hi < players.length; hi++) {
        players[hi].stam = clamp(players[hi].stam + 11, 3, 100);
      }
      hudDirty = true;
      say('전반 종료! ' + M.homeScore + ' : ' + M.awayScore, 'big');
      say('선수들이 물을 들이킵니다. 하프타임에 교체를 준비하세요.', 'normal');
      if (cfg.onHalftime) { cfg.onHalftime(); }
      return;
    }
    if (halftimeDone && simTime >= (90 + addedTime.second) * PER_MIN) { endMatch(); return; }

    /* 오프사이드 트랩 */
    if (buffOf('offside') > 0 && ball.carrier && ball.carrier.side === 'away') {
      if (progressOf('away', ball.carrier.y) > 0.35 && chance(dt * 0.22)) {
        var att = ball.carrier;
        bubble(att, '🚩 오프사이드!', '#9fd8ff', 1.6);
        say('🚩 오프사이드 선언! 수비 라인의 트랩이 통했습니다.', 'tackle');
        var fk = goalkeeper('home') || nearestToBall('home');
        ball.carrier = null;
        ball.kind = 'idle';
        ball.vx = 0; ball.vy = 0;
        ball.x = att.x; ball.y = att.y;
        if (fk) { giveBall(fk); }
        setSit('fk', '오프사이드 트랩 성공', true);
        return;
      }
    }

    /* 세트피스 대기 */
    if (play.phase === 'setpiece') {
      var sp = play.setpiece;
      updateTargets(dt);
      for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
      separate();
      if (sp) {
        sp.t -= dt;
        if (sp.t <= 0) { executeSetpiece(sp); }
      } else { play.phase = 'play'; }
      lastHud += dt;
      if (hudDirty || lastHud > 0.5) { lastHud = 0; pushHud(); }
      return;
    }

    if (play.phase === 'kickoff') {
      play.timer -= dt;
      if (play.timer <= 0) { play.phase = 'play'; }
    }

    /* 안전장치: 공이 경기장 밖으로 크게 벗어나면 루즈볼로 회수 (공이 무한히 날아가는 정지 방지) */
    if (ball.x < -10 || ball.x > WORLD_W + 10 || ball.y < -10 || ball.y > WORLD_H + 10) {
      ball.x = clamp(ball.x, 6, WORLD_W - 6);
      ball.y = clamp(ball.y, 6, WORLD_H - 6);
      ball.kind = 'idle';
      ball.vx = 0; ball.vy = 0;
      ball.flight = 0;
      ball.shot = null;
      play.looseT = 1.2;
    }

    updateStage(dt);
    updateTargets(dt);
    for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
    separate();
    updateBall(dt);

    fillerTimer -= dt;
    if (fillerTimer <= 0) {
      fillerTimer = 7 + Math.random() * 6;
      if (ball.carrier && chance(0.55)) {
        say(pick([
          '중원에서 치열한 공방전이 이어집니다.',
          '양 팀 모두 물러서지 않습니다.',
          U.josa(short(ball.carrier.name), '이/가') + ' 공을 지키고 있습니다.',
          '패스 한 번, 패스 한 번 — 호흡이 좋습니다.',
          '벤치에서도 목소리가 커집니다!',
          '관중들이 박자를 맞춥니다. 둥둥둥!'
        ]), 'normal');
      } else if (!ball.carrier && chance(0.4)) {
        say('공이 공중에 뜹니다! 모두 머리를 향해 달려갑니다!', 'normal');
      }
    }

    lastHud += dt;
    if (hudDirty || lastHud > 0.5) { lastHud = 0; pushHud(); }
  }

  function updateStage(dt) {
    var c = ball.carrier;
    if (!c) { return; }
    var prog = progressOf(c.side, c.y);
    var sideLane = (c.x < 22 || c.x > 78);
    var st;
    if (prog < 0.34) { st = 'build'; }
    else if (prog < 0.62) { st = 'mid'; }
    else if (sideLane && prog < 0.87) { st = 'wide'; }
    else { st = 'final'; }
    if (st !== play.stage) { play.stage = st; play.stageT = 0; }
    play.stageT += dt;

    if (play.phase !== 'play') { return; }
    if (play.counterT > 0) {
      setSit(play.counterSide === 'home' ? 'counterAtk' : 'counterDef');
    } else if (buffOf('press') > 0 && c.side === 'away') {
      setSit('press');
    } else {
      setSit(st);
    }
  }

  function updateBall(dt) {
    var c = ball.carrier, i, q, d;
    if (c) {
      possession[c.side] += dt;
      ball.x = c.x + (50 - c.x) * 0.012;
      ball.y = c.y + goalDir(c.side) * 1.4;
      ball.z = 0; ball.vz = 0;
      ball.flight = 0;
      var near = nearestOpponentPx(c, tacklePx());
      if (near.player) { tryTackle(near.player, c, dt); }
      actionTimer -= dt;
      if (actionTimer <= 0 && ball.carrier === c) {
        actionTimer = 0.36 + Math.random() * 0.22;
        decide();
      }
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.flight += dt;
    if (ball.z > 0 || ball.vz > 0) {
      ball.z += ball.vz * dt;
      ball.vz -= BALL_G * dt;
      if (ball.z <= 0) { ball.z = 0; ball.vz = 0; }
    }
    if (ball.trail.length === 0) { ball.trail.push({ x: ball.x, y: ball.y }); }
    else {
      var last = ball.trail[ball.trail.length - 1];
      if (Math.hypot(last.x - ball.x, last.y - ball.y) > 0.8) {
        ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
        if (ball.trail.length > 22) { ball.trail.shift(); }
      }
    }

    if (ball.kind === 'shot') {
      if (ball.flight >= ball.dur) { resolveShot(); return; }
    } else if (ball.kind === 'pass') {
      /* 패스 차단 */
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.off || (ball.from && q.side === ball.from.side) || q === ball.receiver) { continue; }
        d = Math.hypot(q.x - ball.x, q.y - ball.y);
        if (d < 2.5) {
          var pInt = clamp(1.0 * dt * (1 + q.player.stats.def / 110), 0, 0.45);
          if (buffOf('press') > 0 && q.side === 'home') { pInt *= 1.4; }
          if (buffOf('tiki') > 0 && ball.from && ball.from.side === 'home') { pInt *= 0.7; }
          if (q.side === 'home') { pInt *= 1 + mfx('press') * 0.02 + mfx('def') * 0.01; }
          if (ball.from && ball.from.side === 'home') { pInt *= 1 - clamp(mfx('pass') * 0.02, 0, 0.16); }
          if (chance(pInt)) {
            stats.interceptions++;
            bubble(q, '🛡️ 차단!', '#9fd8ff', 1.2);
            say(U.josa(short(q.name), '이/가') + ' 패스를 읽고 차단합니다!', 'tackle');
            giveBall(q);
            M.phase = 'play';
            return;
          }
        }
      }
      /* 리시버 트래핑 */
      if (ball.receiver && d2(ball.receiver, ball) < 2.6) {
        var rv = ball.receiver;
        giveBall(rv);
        addRating(rv, 0.02);
        M.phase = 'play';
        return;
      }
      if (ball.flight >= ball.dur + 0.25) { settleBall(); return; }
    }

    if (ball.y < 1 || ball.y > WORLD_H - 1 || ball.x < 1 || ball.x > WORLD_W - 1) {
      if (ball.kind === 'shot' && ball.shot) { resolveShot(); return; }
      ball.kind = 'idle';
      ball.vx = 0; ball.vy = 0;
      ball.flight = 0;
      outOfPlay(ball.y < 1 || ball.y > WORLD_H - 1 ? (ball.y < 1 ? 'y0' : 'y120') : 'x');
      return;
    }

    if (!ball.carrier && ball.kind === 'idle') {
      play.looseT += dt;
      if (play.looseT > 1.1) {
        var np = nearestToBall(play.atkSide === 'home' ? 'away' : 'home', 999) ||
                 nearestToBall(play.atkSide, 999);
        if (np) { giveBall(np); }
        play.looseT = 0;
      }
    }
  }

  /* ─────────────────────────  종료  ───────────────────────── */
  function endMatch() {
    M.phase = 'ended';
    M.running = false;
    M.clock = 90;
    updateScoreboard();
    say('경기 종료! 스코어 ' + M.homeScore + ' : ' + M.awayScore, 'big');

    var i;
    var best = null;
    for (i = 0; i < ratings.length; i++) {
      var r = ratings[i];
      r.rating = Math.round(r.rating * 10) / 10;
      if (!r.subbedOut && (!best || r.rating > best.rating)) { best = r; }
    }
    if (best) { best.mvp = true; }

    var totP = possession.home + possession.away;
    var homePoss = Math.round(possession.home / totP * 100);

    var res = {
      homeScore: M.homeScore,
      awayScore: M.awayScore,
      half: halfScore,
      goals: goals,
      cautions: cautions,
      ratings: ratings,
      mvp: best ? { name: best.name } : null,
      mvpRating: best ? best.rating : 6,
      shots: { home: goalStats.homeShots, away: goalStats.awayShots },
      passes: stats.passes,
      tackles: stats.tackles,
      saves: stats.saves,
      possession: [homePoss, 100 - homePoss],
      cards: cardUses,
      momentum: Math.round(momentum),
      xg: [Math.round(homeXg * 10) / 10, Math.round(awayXg * 10) / 10]
    };
    if (cfg.onEnd) { cfg.onEnd(res); }
  }

  /* ───────────────  그리기 (가로 피치 · 원형 초상화 토큰)  ───────────────
     v10: 피치 위 22명의 몸통을 지우고, 고유 얼굴을 담은 원형 토큰으로 그린다.
     원 바깥 두까운 링이 팀을 나누다 — 홈 = 생생한 파랑, 원정 = 생생한 빨강. */
  var TEAM_FX = {
    home: { ring: '#3b82f6', ring2: '#38bdf8', glow: 'rgba(56,189,248,0.95)', base: 'rgba(8,32,58,0.94)', base2: 'rgba(12,52,92,0.94)', text: '#d9f2ff' },
    away: { ring: '#ef4444', ring2: '#f87171', glow: 'rgba(248,113,113,0.95)', base: 'rgba(52,10,14,0.94)', base2: 'rgba(92,18,24,0.94)', text: '#ffe2dc' }
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 실제 경기 공 — 일러스트에 그려진 공과 헷갈리지 않게 네온 링·진한 외곽선·그림자 */
  function drawMatchBall(x, y, r, groundY) {
    var hot = ball.kind === 'shot';
    var airborne = ball.z > 0.05;
    var gy = (groundY == null ? y + r * 1.02 : groundY);
    /* 바닥 그림자 — 공중에 뜨면 지면에 따로 남는다 */
    ctx.save();
    ctx.globalAlpha = airborne ? 0.24 : 0.42;
    ctx.fillStyle = '#02110c';
    ctx.beginPath();
    ctx.ellipse(x, gy + (airborne ? 0 : r * 0.02), r * 1.08, r * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    /* 네온 발광 링 */
    var glowR = r * (hot ? 3.2 : 2.4);
    var gr = ctx.createRadialGradient(x, y, r * 0.45, x, y, glowR);
    gr.addColorStop(0, hot ? 'rgba(255,246,186,0.95)' : 'rgba(206,255,246,0.80)');
    gr.addColorStop(0.5, hot ? 'rgba(255,196,84,0.38)' : 'rgba(120,242,255,0.30)');
    gr.addColorStop(1, 'rgba(120,242,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
    /* 흰 공 본체 */
    ctx.save();
    ctx.shadowColor = hot ? 'rgba(255,222,126,0.95)' : 'rgba(150,255,242,0.92)';
    ctx.shadowBlur = r * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    /* 선명한 검은 외곽선 */
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.strokeStyle = '#08120d';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    /* 오각 패널 — 굴러가는 느낌으로 살짝 회전 */
    ctx.fillStyle = '#14211b';
    ctx.beginPath(); ctx.arc(x - r * 0.06, y - r * 0.10, r * 0.32, 0, Math.PI * 2); ctx.fill();
    var k, a2;
    for (k = 0; k < 4; k++) {
      a2 = simTime * 1.7 + k * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a2) * r * 0.64, y + Math.sin(a2) * r * 0.64, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 하이라이트 */
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(x - r * 0.30, y - r * 0.36, r * 0.20, 0, Math.PI * 2); ctx.fill();
    /* 공 위치 표식 — 일러스트에 그려진 공과 헷갈리지 않게 살짝 떠 있는 표식 */
    if (!hot) {
      var my = y - r * 2.0 - 2 - Math.sin(simTime * 4.2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.58, my - r * 0.62);
      ctx.lineTo(x + r * 0.58, my - r * 0.62);
      ctx.lineTo(x, my);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,18,13,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* v10 — 패스 각(삼각 지원): 볼 소유자와 좌·우·앞 지원 선수를 얇은 점선으로 연결한다 */
  function drawSupportWeb() {
    var c = ball.carrier, list = play.supList, i, s, p0, p1, a;
    if (!c || !list || !list.length) { return; }
    var tf = TEAM_FX[c.side];
    p0 = scr(c.x, c.y);
    for (i = 0; i < list.length; i++) {
      s = list[i];
      if (!s || s.off || !(s.supportT > 0)) { continue; }
      p1 = scr(s.x, s.y);
      a = clamp(s.supportT / 0.9, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.16 + a * 0.20;
      ctx.strokeStyle = tf.ring2;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y - 3);
      ctx.lineTo(p1.x, p1.y - 3);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 지원 선수 발밑 작은 표식 */
      ctx.globalAlpha = 0.30 + a * 0.35;
      ctx.beginPath();
      ctx.ellipse(p1.x, p1.y + 1, SPR_H * 0.20, SPR_H * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPressZone() {
    if (buffOf('press') <= 0) { return; }
    var pc = pressConfig('home');
    var c = scr(ball.x, ball.y);
    var rx = pc.radius * (field.w / WORLD_W) * 0.62;
    var ry = rx * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#ff9f8a';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* v15 — 부심 깃발 · 오프사이드 점선 라인 (패스 순간 2.8초 표시) */
  function drawOffsideLine() {
    if (flagShow.t <= 0) { return; }
    var a = clamp(flagShow.t / 2.8, 0, 1);
    var y = clamp(flagShow.y, 2, WORLD_H - 2);
    var l = scr(0, y), r = scr(WORLD_W, y);
    ctx.save();
    ctx.globalAlpha = 0.25 + a * 0.6;
    ctx.strokeStyle = '#ffd85a';
    ctx.lineWidth = 1.8;
    if (ctx.setLineDash) { ctx.setLineDash([7, 5]); }
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
    ctx.globalAlpha = 0.35 + a * 0.65;
    ctx.fillStyle = 'rgba(8,20,16,0.72)';
    var lx = l.x + (r.x - l.x) * (flagShow.side === 'home' ? 0.08 : 0.92), ly = l.y - 9;
    roundRect(lx - 30, ly - 9, 60, 14, 6); ctx.fill();
    ctx.fillStyle = '#ffd85a';
    ctx.font = '900 8.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚩 오프사이드 라인', lx, ly + 2);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawPassLine() {    var pl = play.passLine;
    if (!pl || pl.t <= 0) { return; }
    var a = clamp(pl.t / pl.t0, 0, 1);
    var p1 = scr(pl.x1, pl.y1), p2 = scr(pl.x2, pl.y2);
    var x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var nx = -(y2 - y1), ny = (x2 - x1);
    var len = Math.hypot(nx, ny) || 1;
    /* v10 — 짧은 패스는 거의 직선, 긴 패스만 잔잔한 커브 */
    var bend = Math.min(14, len * 0.085) * clamp((len - 40) / 120, 0, 1);
    mx += nx / len * bend; my += ny / len * bend;
    ctx.save();
    ctx.globalAlpha = 0.45 + a * 0.55;
    var lg = ctx.createLinearGradient(x1, y1, x2, y2);
    lg.addColorStop(0, 'rgba(255,255,255,0.15)');
    lg.addColorStop(0.35, pl.color);
    lg.addColorStop(1, pl.color);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = pl.color;
    ctx.shadowBlur = 4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    /* 받는 선수 자리 표시 */
    ctx.globalAlpha = 0.5 + a * 0.5;
    ctx.beginPath();
    ctx.arc(x2, y2, 3.4, 0, Math.PI * 2);
    ctx.strokeStyle = pl.color;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    /* 화살촉 */
    ctx.beginPath();
    var ang = Math.atan2(y2 - my, x2 - mx);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 6 * Math.cos(ang - 0.42), y2 - 6 * Math.sin(ang - 0.42));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 6 * Math.cos(ang + 0.42), y2 - 6 * Math.sin(ang + 0.42));
    ctx.stroke();
    ctx.restore();
  }

  /* 슈팅 궤적 — 공 발광 트레일 (v10: 슛은 더 길고 밝게) */
  function drawShotTrail() {
    if (ball.trail.length < 2) { return; }
    var shooting = ball.kind === 'shot';
    var i, t, pt, r;
    var longShot = ball.shot && ball.shot.long;
    for (i = 0; i < ball.trail.length; i++) {
      t = (i + 1) / ball.trail.length;
      pt = scr(ball.trail[i].x, ball.trail[i].y);
      var y = pt.y - depthPx(ball.trail[i].z || 0);
      r = (shooting ? 4.4 : 2.2) + t * (shooting ? 6.0 : 2.4);
      ctx.beginPath();
      var gr = ctx.createRadialGradient(pt.x, y, 0, pt.x, y, r);
      gr.addColorStop(0, shooting
        ? (longShot ? 'rgba(255,240,150,' + (0.86 * t) + ')' : 'rgba(255,214,140,' + (0.80 * t) + ')')
        : 'rgba(200,255,220,' + (0.26 * t) + ')');
      gr.addColorStop(0.55, shooting ? 'rgba(255,150,60,' + (0.34 * t) + ')' : 'rgba(150,255,210,0)');
      gr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gr;
      ctx.arc(pt.x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (longShot) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,248,190,0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (i = 1; i < ball.trail.length; i++) {
        var pp = scr(ball.trail[i].x, ball.trail[i].y);
        if (i === 1) { ctx.moveTo(pp.x, pp.y); }
        else { ctx.lineTo(pp.x + (i % 2 ? 2.6 : -2.6), pp.y + (i % 2 ? -2 : 2)); }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBubble(p, px, py, sprH, extraUp) {
    var b = p.bubble;
    if (!b) { return; }
    var a = clamp(b.t / 0.35, 0, 1);
    var txt = b.text;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '900 ' + (clamp(SPR_H * 0.28, 7, 9)).toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(txt).width;
    var bh = Math.round(clamp(SPR_H * 0.44, 11, 15));
    var bw = tw + bh * 0.9;
    var rise = (1 - clamp(b.t / b.t0, 0, 1)) * 4;
    var below = false;
    var by = py - sprH - 5 - rise - (extraUp || 0);
    if (by < 3) { by = py + 6 + (extraUp || 0); below = true; }
    var bx = px - bw / 2;
    if (bx < 3) { bx = 3; }
    if (bx + bw > W - 3) { bx = W - 3 - bw; }
    ctx.fillStyle = 'rgba(5, 22, 18, 0.92)';
    roundRect(bx, by, bw, bh, 7);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.2;
    roundRect(bx, by, bw, bh, 7);
    ctx.stroke();
    ctx.beginPath();
    if (below) {
      ctx.moveTo(px - 3.5, by);
      ctx.lineTo(px, by - 4);
      ctx.lineTo(px + 3.5, by);
    } else {
      ctx.moveTo(px - 3.5, by + bh);
      ctx.lineTo(px, by + bh + 4);
      ctx.lineTo(px + 3.5, by + bh);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(5, 22, 18, 0.92)';
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  }

  /* 선수 1명 — 원형 초상화 토큰 (팀 링 · GK 뱃지 · 피로 게이지 · 소유자 펄스 · 액션 탄) */
  function drawPlayer(p) {
    var g = scr(p.x, p.y);
    var pose = poseOf(p);
    var r = Math.max(5.6, SPR_H * g.s * TOKEN_R);   /* 토큰 반지름 — 원근 스케일 적용 (v14 축소) */
    var tf = TEAM_FX[p.side];
    var isCarrier = ball.carrier === p;
    var gk = isGK(p);
    var headRec = loadHead(p);
    var t = simTime;
    var hop = 0, tilt = 0, slide = 0, scale = 1;

    if (pose === 'dive') {                     /* GK 다이빙 — 옆으로 날아가며 기운다 */
      var dk = clamp(1 - p.diveT / 0.7, 0, 1);
      slide = (p.diveDir || 1) * r * (0.45 + Math.sin(dk * Math.PI) * 0.55);
      hop = -r * Math.sin(dk * Math.PI) * 0.55;
      tilt = (p.diveDir || 1) * 0.20;
    } else if (pose === 'tackle') {
      slide = (p.facing || 1) * r * 0.34;
      tilt = (p.facing || 1) * 0.15;
    } else if (pose === 'kick') {
      hop = -r * 0.18;
      tilt = 0.05;
    } else if (pose === 'pass') {
      hop = -r * 0.07;
    } else if (pose === 'celebrate') {
      hop = -Math.abs(Math.sin(t * 6.2)) * r * 0.85;
      tilt = Math.sin(t * 6.2) * 0.10;
    } else if (pose === 'run' || pose === 'dribble') {
      hop = -Math.abs(Math.sin(p.phase * 1.55)) * r * 0.22;
      tilt = 0.04;
    }
    if (p.popT > 0) {                          /* 액션 탄 — 슛·패스·태클·선방 순간 가볍게 튀어 오른다 */
      var pk = 1 - clamp(p.popT / (p.popT0 || 0.3), 0, 1);
      hop -= Math.sin(pk * Math.PI) * r * 0.7;
    }
    if (isCarrier) { scale = 1.12 + 0.018 * Math.sin(t * 5.2); }

    var cx = g.x + slide;
    var cy = g.y - r * 0.96 + hop;             /* 원 아래가 잔디에 닿는다 */
    var ringW = Math.max(1.7, r * 0.22);       /* 팀 링 두께 — v14: 토큰과 함께 슬림하게 */
    var PI2 = Math.PI * 2;

    /* ── 지면 그림자 (떠 있는 높이만큼 짙고 넓게) ── */
    var air = clamp(Math.abs(hop) / (r * 2.2), 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.46 - air * 0.20;
    ctx.fillStyle = '#02110c';
    ctx.beginPath();
    ctx.ellipse(g.x + slide * 0.45, g.y + 1.2, r * (1.02 + air * 0.30), r * 0.36, 0, 0, PI2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    if (tilt) { ctx.rotate(tilt); }
    if (scale !== 1) { ctx.scale(scale, scale); }

    /* ── 공 소유자 — 밝은 시안/골드 펄스 링 ── */
    if (isCarrier) {
      var pz = 0.5 + 0.5 * Math.sin(t * 6.2);
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r * (1.15 + 0.05 * pz), 0, PI2);
      ctx.strokeStyle = 'rgba(120,242,255,' + (0.55 + 0.35 * pz) + ')';
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * (1.29 + 0.08 * pz), 0, PI2);
      ctx.strokeStyle = 'rgba(255,222,126,' + (0.35 + 0.45 * pz) + ')';
      ctx.lineWidth = 1.35;
      ctx.shadowColor = 'rgba(255,214,90,0.9)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }
    /* 카드·특기 발동 — 금빛 이중 링 */
    if (p.skillT > 0 || p.glow > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r + ringW * 1.55, 0, PI2);
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -t * 14;
      ctx.strokeStyle = 'rgba(255,232,150,0.9)';
      ctx.lineWidth = 1.3;
      ctx.shadowColor = 'rgba(255,214,90,0.85)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }

    /* ── 팀 톤 바탕 원판 ── */
    var bg = ctx.createRadialGradient(-r * 0.34, -r * 0.42, r * 0.12, 0, 0, r * 1.02);
    bg.addColorStop(0, tf.base2);
    bg.addColorStop(1, tf.base);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2);
    ctx.fillStyle = bg;
    ctx.fill();

    /* ── 원형 클립 안에 고유 초상화 — 얼굴·헤어가 꿉 차고 또렷하게 ── */
    if (headRec.ready) {
      var iw = headRec.img.naturalWidth || headRec.img.width || 0;
      var ih = headRec.img.naturalHeight || headRec.img.height || 0;
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r - 0.4, 0, PI2);
      ctx.clip();
      if (iw > 0 && ih > 0) {
        var base = Math.min(iw, ih);
        var S = base * 0.86;                            /* 머리 영역 정사각 크롭 (얼굴을 크게) */
        var sx = clamp(iw * (headRec.fx || 0.5) - S / 2, 0, Math.max(0, iw - S));
        var sy = clamp(base * 0.17, 0, Math.max(0, ih - S));   /* 눈·얼굴을 원 가운데로 */
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(headRec.img, sx, sy, S, S, -r, -r, r * 2, r * 2);
      }
      /* 원 안쪽 입체 음영 */
      var sh = ctx.createLinearGradient(0, -r, 0, r);
      sh.addColorStop(0, 'rgba(255,255,255,0.12)');
      sh.addColorStop(0.58, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fill();
      ctx.restore();
    } else {
      /* 로드 전 폴백 — 팀 컬러 실루엣 */
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.clip();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = tf.ring;
      ctx.beginPath(); ctx.arc(0, r * 0.10, r * 0.44, 0, PI2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, r * 0.86, r * 0.62, r * 0.52, 0, Math.PI, 0); ctx.fill();
      ctx.restore();
    }

    /* 원 안쪽 흰 하이라이트 선 */
    ctx.beginPath(); ctx.arc(0, 0, r - 0.7, 0, PI2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* ★ 팀 구분 두까운 링 — 홈 파랑 / 원정 빨강 (은은한 글로우) */
    var ringGrad = ctx.createLinearGradient(0, -r - ringW, 0, r + ringW);
    ringGrad.addColorStop(0, tf.ring2);
    ringGrad.addColorStop(1, tf.ring);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r + ringW * 0.5 - 0.3, 0, PI2);
    ctx.lineWidth = ringW;
    ctx.strokeStyle = ringGrad;
    ctx.shadowColor = tf.glow;
    ctx.shadowBlur = isCarrier ? r * 0.55 : (p.skillT > 0 || p.glow > 0 ? r * 0.44 : r * 0.22);
    ctx.stroke();
    ctx.restore();
    /* 바깥 경계선 — 밝은 잔디·관중 위에서도 원이 또렷하게 */
    ctx.beginPath(); ctx.arc(0, 0, r + ringW - 0.15, 0, PI2);
    ctx.lineWidth = Math.max(0.8, ringW * 0.26);
    ctx.strokeStyle = 'rgba(4,14,10,0.70)';
    ctx.stroke();

    /* GK — 링 안쪽 금색 이중 포인트 */
    if (gk) {
      ctx.beginPath(); ctx.arc(0, 0, r - ringW * 1.05, 0, PI2);
      ctx.strokeStyle = '#f6c945';
      ctx.lineWidth = Math.max(0.9, r * 0.11);
      ctx.globalAlpha = 0.95;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* ── 체력 경고 게이지 (40% 이하) ── */
    if (p.stam <= 40) { drawFatigue(p, cx, cy, r, ringW); }

    /* ── GK 뱃지 · 공 소유자 이름표 ── */
    if (isCarrier) {
      drawNamePlate(p, cx, g.y + 4.2, tf);
    } else if (gk) {
      var gb = clamp(r * 0.50, 2.9, 4.2);
      var gw = Math.max(10, gb * 3.0);
      ctx.font = '900 ' + gb.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(6,20,16,0.82)';
      roundRect(cx - gw / 2, g.y + 2.4, gw, gb * 1.9, gb * 0.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,201,69,0.95)';
      ctx.lineWidth = 0.9;
      roundRect(cx - gw / 2, g.y + 2.4, gw, gb * 1.9, gb * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#ffdf7e';
      ctx.fillText('GK', cx, g.y + 2.4 + gb * 0.95 + 0.3);
      ctx.textAlign = 'left';
    }
  }

  /* 공 소유자 이름표 */
  function drawNamePlate(p, cx, y, tf) {
    var lb = clamp(SPR_H * 0.24, 6, 8.4);
    ctx.font = '800 ' + lb.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = short(p.name);
    var lh = lb + 3.1;
    var tw2 = ctx.measureText(label).width + lh * 0.9;
    ctx.fillStyle = 'rgba(6,26,22,0.82)';
    roundRect(cx - tw2 / 2, y, tw2, lh, lh / 2);
    ctx.fill();
    ctx.strokeStyle = tf.ring2;
    ctx.lineWidth = 0.9;
    roundRect(cx - tw2 / 2, y, tw2, lh, lh / 2);
    ctx.stroke();
    ctx.fillStyle = tf.text;
    ctx.fillText(label, cx, y + lh / 2 + 0.4);
    ctx.textAlign = 'left';
  }

  /* 체력 40% 이하 경고 — 토큰 우상단 점 + 링 바깥 게이지 (노랑 25~40% / 빨강 25% 미만) */
  function drawFatigue(p, cx, cy, r, ringW) {
    var critical = p.stam < 25;
    var col = critical ? '#ff3b30' : '#ffd23b';
    var frac = clamp(p.stam / 40, 0, 1);
    var pulse = critical ? 0.5 + 0.5 * Math.sin(simTime * 9) : 0.94;
    var rr = r + ringW + 1.6;
    ctx.save();
    ctx.globalAlpha = pulse;
    /* 링 바깥을 따라 남은 체력 아크 (정수리 방향에서 시작) */
    ctx.beginPath();
    ctx.arc(cx, cy, rr, -Math.PI * 0.68, -Math.PI * 0.68 + Math.PI * 0.52 * frac);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.3, ringW * 0.55);
    ctx.shadowColor = col;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    /* 우상단 경고 점 */
    var dx = cx + rr * 0.70, dy = cy - rr * 0.70;
    ctx.beginPath();
    ctx.arc(dx, dy, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,20,16,0.85)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  /* 액션 파동 — 토큰 발밑에서 바깥으로 퍼지는 원 (지면 원근으로 납작) */
  function drawRipples() {
    var i, rp, age, sp, rx, ry;
    for (i = 0; i < ripples.length; i++) {
      rp = ripples[i];
      age = clamp(rp.t / rp.t0, 0, 1);
      sp = scr(rp.x, rp.y);
      rx = SPR_H * sp.s * TOKEN_R * rp.k * (0.85 + age * 2.4);
      ry = rx * 0.46;
      ctx.save();
      ctx.globalAlpha = (1 - age) * 0.78;
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = Math.max(0.9, 2.6 * (1 - age));
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 골 전광판 — 위에서 미끄러져 들어와 잠시 머물고 사라진다 */
  function drawScoreboard() {
    var k = flash.t / flash.t0;                 /* 1 → 0 */
    var inT = clamp((1 - k) / 0.18, 0, 1);      /* 등장 */
    var outT = clamp(k / 0.16, 0, 1);           /* 퇴장 */
    var e = inT * inT * (3 - 2 * inT);
    var a = Math.min(e, outT);
    var w = Math.min(238, W * 0.50), h = 34;
    var x = W / 2 - w / 2;
    var y = -h + (h + 10) * e;
    var home = flash.side === 'home';
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.shadowColor = home ? 'rgba(56,189,248,0.75)' : 'rgba(248,113,113,0.75)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(5,18,14,0.94)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = home ? '#38bdf8' : '#f87171';
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    /* 왼쪽 골드 바 */
    ctx.fillStyle = '#f6c945';
    roundRect(x + 6, y + 7, 4, h - 14, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe98a';
    ctx.font = '900 14px system-ui, -apple-system, sans-serif';
    ctx.fillText('GOAL', x + 17, y + h / 2 + 0.5);
    ctx.fillStyle = 'rgba(233,244,221,0.92)';
    ctx.font = '700 10.5px system-ui, -apple-system, sans-serif';
    ctx.fillText(home ? cfg.homeShort : cfg.awayShort, x + 60, y + h / 2 + 0.5);
    /* 오른쪽 스코어 */
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(flash.score, x + w - 13, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function draw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, W, H);
    if (pitchLayer) { ctx.drawImage(pitchLayer, 0, 0, W, H); }
    else { DS.Art.drawPitch(ctx, W, H, { landscape: true, crowd: true }); }

    /* 카메라 흔들림 — 슛·골·선방 순간 경기장이 짧게 울린다 */
    var shk = 0;
    if (shake.t > 0) {
      shk = clamp(shake.t / Math.max(0.01, shake.t0), 0, 1);
    }
    ctx.save();
    if (shk > 0) {
      var amp = shake.mag * shk;
      ctx.translate(Math.sin(simTime * 61) * amp, Math.cos(simTime * 47) * amp * 0.7);
    }

    drawPressZone();
    drawPassLine();
    drawOffsideLine();
    drawSupportWeb();
    drawRipples();

    var arr = players.slice().sort(function (a, b) {
      if (Math.abs(a.x - b.x) > 0.6) { return a.x - b.x; }
      return b.y - a.y;
    });
    var i, p;

    drawShotTrail();

    for (i = 0; i < arr.length; i++) { drawPlayer(arr[i]); }

    /* 말풍선 (겹치면 위로 쌓는다) */
    var placed = [];
    for (i = 0; i < arr.length; i++) {
      p = arr[i];
      if (!p.bubble) { continue; }
      var g = scr(p.x, p.y);
      var up = 0, guard = 0, q;
      for (q = 0; q < placed.length && guard < 4; q++) {
        if (Math.abs(placed[q].x - g.x) < 62 && Math.abs(placed[q].y - g.y) < 26) { up += 16; guard++; }
      }
      placed.push({ x: g.x, y: g.y, up: up });
      drawBubble(p, g.x, g.y, SPR_H * g.s, up);
    }

    /* 볼 — 높이(z)에 따라 지면 그림자와 분리된다 */
    var bp = scr(ball.x, ball.y);
    var zpx = depthPx(ball.z);
    var r = Math.max(4.4, W / 108) * (1 + Math.min(0.3, zpx * 0.004));
    if (zpx > 0.6) {
      ctx.save();
      ctx.globalAlpha = clamp(0.36 - zpx * 0.006, 0.06, 0.36);
      ctx.fillStyle = '#04140f';
      ctx.beginPath();
      ctx.ellipse(bp.x, bp.y, Math.max(2.4, 5 - zpx * 0.05), Math.max(1.2, 2.2 - zpx * 0.02), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (ball.kind === 'shot') {
      var byy = bp.y - zpx - r;
      var gr2 = ctx.createRadialGradient(bp.x, byy, 1, bp.x, byy, r * 3.4);
      gr2.addColorStop(0, 'rgba(255,236,150,0.8)');
      gr2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr2;
      ctx.beginPath(); ctx.arc(bp.x, byy, r * 3.4, 0, Math.PI * 2); ctx.fill();
    }
    drawMatchBall(bp.x, bp.y - zpx - r * 0.35, r, bp.y);
    ctx.restore();

    /* 골 전광판 — 짧게 슬라이드 인/아웃 */
    if (flash.t > 0) { drawScoreboard(); }

    if (artGateOn) {
      var headTotal = 0, headOk = 0, kk2;
      for (kk2 in heads) {
        if (heads.hasOwnProperty(kk2)) { headTotal++; if (heads[kk2].ready) { headOk++; } }
      }
      var ready = headOk;
      var total = headTotal || 1;
      var pct = clamp(ready / total, 0, 1);
      ctx.fillStyle = 'rgba(3,16,13,0.82)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0d2a24';
      ctx.fillStyle = '#eaffd0';
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.fillText('선수단 입장 중', W / 2, H / 2 - 16);
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(233,244,221,.72)';
      ctx.fillText('원형 초상화 ' + ready + ' / ' + total + '명 준비', W / 2, H / 2 + 6);
      var bw = Math.min(240, W * 0.46), bh = 6;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      roundRect(W / 2 - bw / 2, H / 2 + 18, bw, bh, 3); ctx.fill();
      ctx.fillStyle = '#c8f169';
      roundRect(W / 2 - bw / 2, H / 2 + 18, Math.max(2, bw * pct), bh, 3); ctx.fill();
      ctx.textAlign = 'left';
    }
    if (M.halftime && M.running) {
      ctx.fillStyle = 'rgba(4,20,16,0.55)';
      ctx.fillRect(0, H / 2 - 22, W, 44);
      ctx.fillStyle = '#d6ff8a';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HALF TIME', W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
    }
    if (M.paused && M.running && !M.halftime && !artGateOn) {
      ctx.fillStyle = 'rgba(4,20,16,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#eaffd0';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', W / 2, H / 2 + 5);
      ctx.textAlign = 'left';
    }
  }

  /* v16 계측: 프레임 단위 선수 좌표·토큰 반지름 — 겹침·GK 밀집·블록 위치를 실측한다 */
  M.inspect = function () {
    var i, p, out = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      var g = scr(p.x, p.y);
      out.push({
        side: p.side, pos: p.pos, name: p.name, gk: isGK(p), carrier: ball.carrier === p,
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
        tx: Math.round(p.tx * 100) / 100, ty: Math.round(p.ty * 100) / 100,
        sx: Math.round(g.x * 10) / 10, sy: Math.round(g.y * 10) / 10,
        r: Math.round(Math.max(5.6, SPR_H * g.s * TOKEN_R) * 10) / 10,
        kind: p.kind, moving: !!p.moving,
        bubble: p.bubble ? p.bubble.text : null,
        slot: p.boxSlot ? p.boxSlot.name : null,
        stam: Math.round(p.stam)
      });
    }
    return {
      t: Math.round(simTime * 1000) / 1000, clock: Math.round(M.clock * 10) / 10,
      phase: play.phase, stage: play.stage, atk: play.atkSide,
      ball: { x: Math.round(ball.x * 10) / 10, y: Math.round(ball.y * 10) / 10, carrier: ball.carrier ? ball.carrier.name : null, kind: ball.kind },
      view: { w: W, h: H, sprH: SPR_H, tokenR: TOKEN_R, sepK: SEP_K, field: field },
      sepMove: Math.round(sepMove * 1000) / 1000,
      recoverT: Math.round(play.recoverT * 100) / 100, recoverSide: play.recoverSide,
      p: out
    };
  };

  /* 검증용 상태 조회 (포메이션·전술·카드가 실제 좌표에 반영됐는지) */
  M.probe = function () {
    var i, p, h = [], a = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      var row = {
        pos: p.pos, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
        pic: (p.player && p.player.pic) || null,
        head: (function () { var hrec = heads[(p.player && p.player.pic) || 1]; return hrec && hrec.ready ? 'loaded' : 'pending'; })(),
        tx: Math.round(p.tx), ty: Math.round(p.ty), kind: p.kind,
        pose: poseOf(p), moving: !!p.moving, support: !!(p.supportT > 0), run: !!(p.runT > 0),
        stam: Math.round(p.stam), tokenR: Math.round(SPR_H * scr(p.x, p.y).s * TOKEN_R * 10) / 10,
        ring: p.side === 'home' ? TEAM_FX.home.ring : TEAM_FX.away.ring, gk: isGK(p),
        carrier: ball.carrier === p, ringColor: (p.side === 'home' ? 'blue' : 'red'),
        bodySprite: false,
        bubble: p.bubble ? p.bubble.text : null,
        screen: (function () {
          var g = scr(p.x, p.y);
          return { x: Math.round(g.x), y: Math.round(g.y), scale: Math.round(g.s * 100) / 100, sprH: Math.round(SPR_H * g.s) };
        })(),
        art: (function () { var rec = heads[(p.player && p.player.pic) || 1]; return rec && rec.ready ? 'loaded' : 'pending'; })()
      };
      if (p.side === 'home') { h.push(row); } else { a.push(row); }
    }
    var pcs = pressConfig('home');
    var ready = 0, kk;
    for (kk in heads) { if (heads.hasOwnProperty(kk) && heads[kk].ready) { ready++; } }
    return {
      clock: minute(), phase: play.phase, stage: play.stage, sit: play.sitKey, paused: M.paused, halftime: M.halftime,
      view: {
        mode: 'landscape', w: W, h: H, sprH: SPR_H, field: field,
        pitchImage: !!(pitchImg && pitchImg.naturalWidth),
        loadingGate: artGateOn, loadingLeft: headLeft,
        portraitsReady: ready, portraitsTotal: (function () { var n = 0; for (kk in heads) { if (heads.hasOwnProperty(kk)) { n++; } } return n; })(),
        homeAttack: 'left→right', awayAttack: 'right→left'
      },
      ball: { x: Math.round(ball.x), y: Math.round(ball.y), z: Math.round(ball.z * 10) / 10, vz: Math.round(ball.vz), kind: ball.kind, shot: !!ball.shot },
      passLine: play.passLine ? true : false,
      formation: {
        home: formationOf('home'), away: formationOf('away'), tactic: tactic,
        styleHome: styleKeyOf('home'), styleAway: styleKeyOf('away'),
        morphHome: morphOf('home'), morphAway: morphOf('away'),
        lineHome: Math.round(lineYOf('home')), lineAway: Math.round(lineYOf('away')),
        pressHome: Math.round(pcs.press), pressers: pcs.n,
        pressAway: Math.round(pressConfig('away').press), pressersAway: pressConfig('away').n,
        shape: shapeOf('home'),
        bankMf: Math.round(bankYOf('home', 'MF')), bankFw: Math.round(bankYOf('home', 'FW')),
        mfRowY: (function () { var s = 0, n = 0, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'home' && isMidGroup(players[j]) && !players[j].off) { s += players[j].y; n++; } } return n ? Math.round(s / n) : null; })(),
        dfRowY: Math.round(defLineY('home')),
        dfRowYAway: Math.round(defLineY('away')),
        mfRowYAway: (function () { var s = 0, n = 0, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'away' && isMidGroup(players[j]) && !players[j].off) { s += players[j].y; n++; } } return n ? Math.round(s / n) : null; })(),
        widthAway: (function () { var lo = 999, hi = -999, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'away' && !isGK(players[j]) && !players[j].off) { lo = Math.min(lo, players[j].x); hi = Math.max(hi, players[j].x); } } return hi > lo ? Math.round(hi - lo) : 0; })(),
        widthHome: (function () { var lo = 999, hi = -999, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'home' && !isGK(players[j]) && !players[j].off) { lo = Math.min(lo, players[j].x); hi = Math.max(hi, players[j].x); } } return hi > lo ? Math.round(hi - lo) : 0; })()
      },
      support: {
        count: (play.supList || []).length,
        names: (play.supList || []).map(function (s) { return s.name; }),
        carriers: ball.carrier ? ball.carrier.name : null
      },
      fx: {
        ripples: ripples.length, shake: Math.round(shake.t * 100) / 100,
        flash: Math.round(flash.t * 100) / 100, passLine: play.passLine ? 1 : 0
      },
      buffs: (function () { var o = [], k; for (k in buffs) { if (buffs[k] > 0) { o.push(k); } } return o; })(),
      tele: { pass: tele.pass, press: tele.press, swarm: tele.swarm, longwin: tele.longwin },
      home: h, away: a
    };
  };

  DS.Match = M;

})(window);
