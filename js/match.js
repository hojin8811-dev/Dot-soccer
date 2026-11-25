/*! 도트싸커 v4 — 진짜 축구 AI · 실시간 경기 엔진 (match.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var rnd = U.rnd, range = U.range, chance = U.chance, clamp = U.clamp, pick = U.pick;

  var WORLD_W = 100;
  var WORLD_H = 120;
  var MATCH_SECONDS = 96;      /* ×1 배속에서 96초에 90분 경기 */
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
  var homeXg = 0, awayXg = 0;

  /* ── 모멘텀 · 전술 카드 ── */
  var momentum = 0;
  var hand = [];
  var drawQueue = [];
  var buffs = {};
  var cutinHold = 0;
  var cardUses = 0;
  var lastHud = 0;
  var hudDirty = true;

  /* ── 볼 ── */
  var ball = {
    x: 50, y: 60, vx: 0, vy: 0,
    carrier: null, from: null, receiver: null,
    kind: 'idle', flight: 0, dur: 0,
    aim: null, shot: null, trail: [], assist: null
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
    looseT: 0
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
    press:     { label: '전방 압박',     sub: '볼 탈취 시도',           tone: 'press' },
    save:      { label: 'GK 선방',       sub: '슛을 막아냅니다',         tone: 'save' },
    goal:      { label: 'GOAL!',        sub: '골망을 흔듭니다',         tone: 'hot' }
  };

  /* ─────────────────────────  좌표 · 기본  ───────────────────────── */
  function sx(x) { return field.x + (x / WORLD_W) * field.w; }
  function sy(y) { return field.y + (y / WORLD_H) * field.h; }
  function goalDir(side) { return side === 'home' ? -1 : 1; }        /* 공격 방향 y */
  function ownGoalY(side) { return side === 'home' ? WORLD_H : 0; }
  function attackGoalY(side) { return side === 'home' ? 0 : WORLD_H; }
  function progressOf(side, y) { return side === 'home' ? (WORLD_H - y) / WORLD_H : y / WORLD_H; }
  function short(n) { return n && n.length > 3 ? n.slice(1) : n; }
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
  function defLineY(side) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === side && isDefGroup(p) && !p.off) { sum += p.y; n++; }
    }
    return n ? sum / n : (side === 'home' ? 100 : 20);
  }

  /* ── 팀 형태: 포메이션 지표 + 전술 + 카드가 실제 라인·압박·폭을 바꾼다 ── */
  function formationOf(side) {
    return side === 'home' ? ((cfg && cfg.homeFormation) || '4-2-3-1')
      : ((cfg && cfg.awayFormation) || '4-4-2');
  }
  function metricsOf(side) {
    var f = DS.FORMATIONS[formationOf(side)];
    return (f && f.metrics) || { press: 70, line: 65, width: 70, tempo: 70 };
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
    var depth = 12 + m.line * 0.44;
    var t = side === 'home' ? tactic : 'balanced';
    if (t === 'attack') { depth += 8; }
    else if (t === 'defense') { depth -= 9; }
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
    return { x: p.baseX, y: p.baseY + blockShift(p.side) * w };
  }
  /* 압박 인원 · 반경 — press 지표와 게겐프레싱 카드로 확대 */
  function pressConfig(side) {
    var m = metricsOf(side);
    var press = m.press;
    if (side === 'home') {
      press += tactic === 'attack' ? 10 : (tactic === 'defense' ? -14 : 0);
      if (buffOf('press') > 0) { press += 26; }
    }
    var n = press >= 80 ? 3 : (press >= 60 ? 2 : 1);
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

  function mkPlayer(side, player, kit, role, pos, x, y) {
    var bx = side === 'home' ? x : 100 - x;
    var by = side === 'home' ? y * 1.2 : WORLD_H - y * 1.2;
    return {
      side: side, player: player, kit: kit, role: role, pos: pos,
      baseX: bx, baseY: by, x: bx, y: by, tx: bx, ty: by,
      vx: 0, vy: 0, phase: Math.random() * 4, frame: 0,
      facing: side === 'home' ? 1 : -1, diveT: 0, diveDir: 1, stun: 0,
      goals: 0, assists: 0, yellows: 0, name: player.name, off: false,
      moving: false, glow: 0, skillT: 0, bubble: null, throughRun: null,
      mark: null, zone: zoneFor(pos, by, side), homeX: bx, homeY: by,
      kind: 'keep'
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
    var i, def;
    for (i = 0; i < hand.length; i++) {
      def = DS.cardOf(hand[i].key);
      if (!def) { continue; }
      out.hand.push({
        key: def.key, name: def.name, cost: def.cost, tag: def.tag, color: def.color,
        icon: def.icon, ready: hand[i].readyAt <= 0 && momentum >= def.cost && cardUses < CARD_LIMIT,
        cooldown: Math.max(0, Math.ceil(hand[i].readyAt))
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
    possession = { home: 0.001, away: 0.001 };
    halfScore = [[0, 0], [0, 0]];
    halftimeDone = false;
    tactic = cfg.tactics || 'balanced';
    formFactor = 0.94 + clamp((cfg.condition || 80) / 900, 0, 0.12);
    spriteCache = {};
    setupDeck(cfg.deck);
    cutinHold = 0;
    play = {
      phase: 'kickoff', timer: 1.0, atkSide: 'home',
      stage: 'build', stageT: 0, counterSide: null, counterT: 0,
      recoverSide: null, recoverT: 0, markT: 0, sitKey: '',
      setpiece: null, passLine: null, looseT: 0
    };
    ball = {
      x: 50, y: 60, vx: 0, vy: 0, carrier: null, from: null, receiver: null,
      kind: 'idle', flight: 0, dur: 0, aim: null, shot: null, trail: [], assist: null
    };
    updateScoreboard();
    clearCommentary();
    resize();
    resetKickoff(Math.random() < 0.5 ? 'home' : 'away');
    M.running = true;
    M.phase = 'play';
    lastT = 0;
    say('휘슬이 울립니다! ' + cfg.homeName + ' 대 ' + cfg.awayName + ', 경기 시작!', 'big');
    say('피치 위 상황 배너를 보고 전술 카드를 타이밍에 맞춰 쓰세요.', 'normal');
    pushHud();
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
    M.paused = false;
    M.halftime = false;
    lastT = 0;
    if (!quiet) { say('후반전 시작! 다시 공을 굴립니다.', 'big'); }
  };
  M.handState = hudState;
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
    W = Math.max(280, Math.round(rect.width));
    H = Math.max(220, Math.round(rect.height));
    dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    var pm = DS.Art.pitchMargin(W, H);
    field = { x: pm, y: pm, w: W - pm * 2, h: H - pm * 2 };
    buildPitchLayer();
  }

  function buildPitchLayer() {
    pitchLayer = document.createElement('canvas');
    pitchLayer.width = Math.round(W * dpr);
    pitchLayer.height = Math.round(H * dpr);
    var g = pitchLayer.getContext('2d');
    if (!g) { return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    DS.Art.drawPitch(g, W, H, { margin: field.x, crowd: true });
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
  }
  function updateScoreboard() {
    var a = document.getElementById('m-gf'), b = document.getElementById('m-ga'), c = document.getElementById('m-clock');
    if (a) { a.textContent = M.homeScore; }
    if (b) { b.textContent = M.awayScore; }
    if (c) { c.textContent = (minute() < 10 ? '0' : '') + minute() + "'"; }
  }

  function setSit(key, extra, force) {
    var meta = SIT[key] || SIT.build;
    if (!force && play.sitKey === key) { return; }
    play.sitKey = key;
    var el = document.getElementById('m-sit');
    if (!el) { return; }
    var team = '';
    if (key !== 'corner' && key !== 'fk' && key !== 'kickoff') {
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

  function updateTargets(dt) {
    var atk = play.atkSide;
    var def = atk === 'home' ? 'away' : 'home';
    var carrier = ball.carrier;
    var pressers = carrier ? assignPressers(def, pressConfig(def)) : [];
    if (carrier) { assignMarks(def); }
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
    var a = anchorOf(p);
    var push = stagePush(p, st);
    var g = groupOf(p);
    var kx = g === 'DF' ? 0.16 : (g === 'MF' ? 0.24 : 0.26);
    var ky = g === 'DF' ? 0.14 : (g === 'MF' ? 0.20 : 0.22);
    var spread = 0.80 + m.width / 100 * 0.55;   /* 폭 지표: 넓은 포메이션은 더 벌어진다 */
    var tx = 50 + (a.x - 50) * spread + (ball.x - 50) * kx;
    var ty = a.y + (ball.y - 60) * ky + z.dir * push;

    /* 측면: 윙어·윙백은 터치라인까지 벌린다 */
    if ((p.pos === 'LWF' || p.pos === 'LWB') && (st === 'wide' || st === 'final')) { tx = 2; }
    if ((p.pos === 'RWF' || p.pos === 'RWB') && (st === 'wide' || st === 'final')) { tx = 98; }

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
      tx = 50 + (a.x - 50) * 0.42;
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

    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, a.y - z.fwd - 8, a.y + z.back + 8);
    p.ty = clamp(p.ty, 3, WORLD_H - 3);
    p.kind = 'atk';
  }

  function defendTarget(p) {
    var z = p.zone;
    var a = anchorOf(p);
    var g = groupOf(p);
    var m = metricsOf(p.side);
    var compress = 0.80 - (m.width / 100) * 0.12;   /* 좁은 포메이션은 중앙으로 더 모인다 */
    var tx = 50 + (a.x - 50) * compress + (ball.x - 50) * 0.18;
    var ty = a.y + (ball.y - 60) * 0.14;
    var drop = 0;
    if (play.recoverT > 0 && play.recoverSide === p.side) { drop += 4; }
    if (tactic === 'defense' && p.side === 'home') { drop += 3; }
    ty += z.dir * -drop * (g === 'DF' ? 1 : 0.6);

    if (p.mark && !p.mark.off) {
      var mk = p.mark;
      var gap = p.side === 'home' ? 2.4 : -2.4;
      var tight = (p.side === 'home' && buffOf('def') > 0 && isDefGroup(p)) ? 0.62 : 0;
      var w = 0.5 + tight * 0.25;
      tx = tx * (1 - w) + (mk.x + tight * 0.7 * (mk.x < 50 ? 1 : -1)) * w;
      ty = ty * (1 - w) + (mk.y + gap) * w;
      if (p.side === 'home' && buffOf('offside') > 0 && g === 'DF') { ty -= 3; }
    }
    /* 마크에 끌려 라인이 무너지지 않도록 전후 제한 */
    if (p.side === 'home') { ty = clamp(ty, a.y - 6, a.y + 12); }
    else { ty = clamp(ty, a.y - 12, a.y + 6); }
    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, a.y - z.fwd - 8, a.y + z.back + 8);
    p.ty = clamp(p.ty, 3, WORLD_H - 3);
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
    if (buffOf('tempo') > 0) { spd *= 1.18; }
    if (buffOf('roar') > 0) { spd *= 1.1; }
    if (p.stun > 0) { p.stun -= dt; spd *= 0.32; }
    var dx = p.tx - p.x, dy = p.ty - p.y;
    var d = Math.hypot(dx, dy);
    if (d > 0.35) {
      var step = Math.min(d, spd * dt);
      p.vx = (dx / d) * spd;
      p.vy = (dy / d) * spd;
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.phase += dt * (7 + spd * 0.22);
      p.frame = Math.floor(p.phase) % 4;
      if (Math.abs(dx) > 0.5) { p.facing = dx > 0 ? 1 : -1; }
      p.moving = true;
    } else {
      p.vx = 0; p.vy = 0; p.moving = false; p.frame = 0;
    }
    p.x = clamp(p.x, 2, WORLD_W - 2);
    p.y = clamp(p.y, 2, WORLD_H - 2);
  }

  function separate() {
    var i, j, a, b, dx, dy, d, minD = 3.0;
    for (i = 0; i < players.length; i++) {
      a = players[i];
      for (j = i + 1; j < players.length; j++) {
        b = players[j];
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.hypot(dx, dy);
        if (d > 0.01 && d < minD) {
          var push = (minD - d) * 0.32;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  /* ─────────────────────────  볼 · 패스 · 슛  ───────────────────────── */
  function bubble(p, text, color, t) {
    if (!p) { return; }
    p.bubble = { text: text, color: color || '#d8ff8a', t: t || 1.5, t0: t || 1.5 };
    p.skillT = Math.max(p.skillT || 0, t || 1.2);
  }

  function giveBall(p) {
    if (!p) { return; }
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
    actionTimer = 0.3 + Math.random() * 0.25;
    play.atkSide = p.side;
    play.looseT = 0;
    if (prev && prev !== p.side) {
      onTurnover(prev, p);
    }
    if (p.side === 'home') { charge(0.4); }
  }

  function onTurnover(fromSide, toP) {
    var prog = progressOf(toP.side, toP.y);
    play.recoverSide = fromSide;
    play.recoverT = 1.4;
    if (prog < 0.45) {
      play.counterSide = toP.side;
      play.counterT = 5.5;
      setSit(toP.side === 'home' ? 'counterAtk' : 'counterDef', '', true);
      say(toP.side === 'home'
        ? '⚡ 볼을 끊고 빠른 역습! 상대 수비가 흐트러졌습니다!'
        : '⚠️ 위험합니다! 상대 역습이 시작됩니다 — 수비 라인 복귀!', 'tackle');
    }
  }

  function kickBall(from, tx, ty, speed, kind, receiver) {
    var dx = tx - ball.x, dy = ty - ball.y;
    var d = Math.max(1.2, Math.hypot(dx, dy));
    ball.carrier = null;
    ball.from = from || null;
    ball.receiver = receiver || null;
    ball.kind = kind;
    ball.flight = 0;
    ball.dur = d / speed;
    ball.vx = dx / ball.dur;
    ball.vy = dy / ball.dur;
    ball.aim = { x: tx, y: ty };
    ball.trail = [{ x: ball.x, y: ball.y }];
    M.phase = kind === 'shot' ? 'shot' : 'pass';
  }

  function isBehindLine(q) {
    var defSide = q.side === 'home' ? 'away' : 'home';
    var line = defLineY(defSide);
    return q.side === 'home' ? q.y < line : q.y > line;
  }

  function passBall(p) {
    var tiki = buffOf('tiki') > 0;
    var through = buffOf('through') > 0;
    var best = null, bestScore = -1e9, i, q, d, fwd, open, score;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 5 || d > 55) { continue; }
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
      if (q.mark && q.mark === p) { score -= 4; }
      score += Math.random() * 5;
      if (score > bestScore) { bestScore = score; best = { q: q, d: d, fwd: fwd, open: open }; }
    }
    if (!best) { return false; }
    var type = 'short';
    if (play.stage === 'final' && (p.x < 24 || p.x > 76) && best.fwd > -2) { type = 'cross'; }
    else if (through && best.fwd > 5 && best.open > 4) { type = 'through'; }
    else if (play.stage === 'mid' && best.fwd > 8 && best.open > 8 && chance(0.45)) { type = 'through'; }
    else if (Math.abs(best.q.x - p.x) > 26 && Math.abs(p.x - 50) < 24) { type = 'switch'; }
    else if (best.fwd > 5) { type = 'progressive'; }
    return kickPass(p, best.q, type);
  }

  function kickPass(p, q, type) {
    var dir = goalDir(p.side);
    var tx, ty, speed;
    var err = buffOf('tiki') > 0 ? 1.2 : (buffOf('build') > 0 ? 2.0 : 3.0);
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
    var dist = Math.hypot(tx - p.x, ty - p.y);
    speed = clamp(dist * 2.4, 32, 74) * (buffOf('tiki') > 0 ? 1.14 : 1);
    ball.x = p.x;
    ball.y = p.y + goalDir(p.side) * 0.8;
    kickBall(p, tx, ty, speed, 'pass', q);
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

  function decide() {
    var p = ball.carrier;
    if (!p) { return; }
    var dist = Math.abs(p.y - attackGoalY(p.side));
    var opp = nearestOpponent(p, 40);
    var pressure = opp.player ? opp.dist : 40;
    var tac = p.side === 'home' ? tactic : 'balanced';
    var shootRange = 22 + (tac === 'attack' ? 4 : 0) + (p.side === 'home' && buffOf('longshot') > 0 ? 12 : 0);
    if (p.side === 'home' && buffOf('atk') > 0) { shootRange += 2; }

    /* 1) 슛 */
    if (dist < shootRange) {
      var pShot = dist < 12 ? 0.52 : (dist < 18 ? 0.36 : 0.22);
      if (pressure < 2.2 && dist > 10) { pShot *= 0.45; }
      if (p.side === 'home' && (buffOf('atk') > 0 || buffOf('longshot') > 0)) { pShot += 0.12; }
      if (chance(pShot)) { shoot(p, dist); return; }
    }
    /* 2) 측면 크로스 */
    if ((play.stage === 'wide' || play.stage === 'final') && (p.x < 22 || p.x > 78) && dist < 34) {
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
    acc -= dist * 0.005;
    var onTarget = chance(clamp(acc, 0.2, 0.86));
    var xg = clamp(0.32 * Math.exp(-dist / 11) + p.player.stats.atk / 2600, 0.02, 0.42);
    if (p.side === 'home' && buffOf('atk') > 0) { xg += 0.05; }
    if (p.side === 'home' && buffOf('longshot') > 0 && dist > 19) { xg += 0.035; }
    if (p.side === 'away' && buffOf('def') > 0) { xg -= 0.045; }
    if (!onTarget) { xg *= 0.12; }
    var isGoal = chance(clamp(xg, 0.01, 0.66));
    var tx = onTarget ? clamp(50 + range(-8, 8), 38, 62) : (chance(0.5) ? range(28, 42) : range(58, 72));
    var speed = clamp(dist * 3.6, 72, 132);

    ball.x = p.x;
    ball.y = p.y;
    kickBall(p, tx, gy, speed, 'shot', null);
    ball.dur = Math.max(0.28, Math.hypot(tx - p.x, gy - p.y) / speed);
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
    bubble(scorer, '⚽ 골!', '#ffe98a', 1.8);
    banner('GOAL!', short(scorer.name) + (isHome ? ' · ' + cfg.homeName : ' · ' + cfg.awayName));
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
    var gk = goalkeeper(side);
    play.phase = 'play';
    play.stage = 'build';
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    if (gk) {
      gk.x = 50; gk.y = ownGoalY(side) - goalDir(side) * 6;
      ball.x = gk.x; ball.y = gk.y - goalDir(side) * 1.2;
      giveBall(gk);
    } else {
      var q = nearestToBall(side);
      if (q) { giveBall(q); }
    }
    setSit('build', '', true);
  }

  function throwIn() {
    var side = play.atkSide === 'home' ? 'away' : 'home';
    var p = nearestToBall(side, 999);
    ball.x = clamp(ball.x, 4, 96);
    ball.y = clamp(ball.y, 4, 116);
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    if (p) { giveBall(p); }
    say('터치라인 밖으로 — ' + (side === 'home' ? cfg.homeShort : cfg.awayShort) + ' 스로인.', 'normal');
  }

  function settleBall() {
    var best = null, bd = 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].off) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    if (best && bd < 9) { giveBall(best); }
    else { play.looseT += 0.5; }
  }

  function tryTackle(defender, carrier, dt) {
    var d = d2(defender, carrier);
    if (d > 3.1) { return; }
    var defSkill = defender.player.stats.def + 8 + (defender.side === 'home' && buffOf('press') > 0 ? 9 : 0);
    var atkSkill = carrier.player.stats.spd * 0.7 + carrier.player.stats.atk * 0.3 + 12;
    var pT = clamp(1.25 * (defSkill / (defSkill + atkSkill)) * dt * 1.9, 0, 0.5);
    if (buffOf('press') > 0 && defender.side === 'home') { pT *= 1.45; }
    if (buffOf('tiki') > 0 && carrier.side === 'home') { pT *= 0.75; }
    if (!chance(pT)) { return; }
    doTackle(defender, carrier);
  }

  function doTackle(defender, carrier) {
    var foulP = clamp(0.11 + (defender.player.tough < 4 ? 0.05 : 0), 0.05, 0.24);
    if (chance(foulP)) {
      foul(defender, carrier);
      return;
    }
    stats.tackles++;
    addRating(defender, 0.18);
    addRating(carrier, -0.06);
    carrier.stun = 0.4;
    carrier.dribbleT = 0;
    bubble(defender, buffOf('press') > 0 ? '🛡️ 압박!' : '🦵 태클!', buffOf('press') > 0 ? '#ff9f8a' : '#ffd98a', 1.2);
    giveBall(defender);
    if (defender.side === 'home') { charge(1.7); }
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 태클! ' + pick([
      '깔끔하게 공을 빼앗습니다!', '몸을 던져 길을 막습니다!', '주머니에 손 넣듯 빼앗아 갑니다!'
    ]), 'tackle');
  }

  function foul(defender, carrier) {
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 파울! 휘슬이 울립니다.', 'tackle');
    if (chance(0.42)) { caution(defender); }
    var atk = carrier.side;
    var prog = progressOf(atk, carrier.y);
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.x = carrier.x;
    ball.y = carrier.y;
    carrier.stun = 0;
    if (prog > 0.5) { freeKick(atk); }
    else { giveBall(carrier); }
  }

  function caution(p) {
    p.yellows = (p.yellows || 0) + 1;
    cautions.push({
      min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name,
      type: p.yellows >= 2 ? 'red' : 'yellow'
    });
    if (p.yellows >= 2) {
      p.off = true;
      say('🟨🟨 ' + U.josa(short(p.name), '이/가') + ' 경고 누적으로 퇴장! 수적 열세입니다.', 'tackle');
      var i = players.indexOf(p);
      if (i >= 0) { players.splice(i, 1); }
      if (ball.carrier === p) { ball.carrier = null; ball.kind = 'idle'; ball.x = p.x; ball.y = p.y; }
      var r = ratingOf(p);
      if (r) { r.rating = clamp(r.rating - 1.2, 3.5, 10); }
    } else {
      say('🟨 ' + U.josa(short(p.name), '에게') + ' 경고 카드가 주어집니다.', 'tackle');
      addRating(p, -0.2);
    }
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
    var best = null, bv = -1, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      var v = p.player.stats.atk + (isFwdGroup(p) ? 20 : 0);
      if (v > bv) { bv = v; best = p; }
    }
    return best;
  }

  function doCorner(side) {
    var dir = goalDir(side);
    play.phase = 'setpiece';
    play.stage = 'final';
    play.setpiece = { type: 'corner', side: side, t: 1.5 };
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    ball.x = ball.x < 50 ? 3.5 : 96.5;
    ball.y = side === 'home' ? 2.5 : WORLD_H - 2.5;
    var i, p, taker = bestTaker(side, 'ck');
    if (taker) {
      taker.x = ball.x + (ball.x < 50 ? 3 : -3);
      taker.y = ball.y + (side === 'home' ? 3 : -3);
      taker.tx = taker.x; taker.ty = taker.y;
    }
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || isGK(p) || p.off) { continue; }
      if (isFwdGroup(p) || isDefGroup(p) || p.pos === 'AM') {
        p.throughRun = {
          x: clamp(50 + (p.baseX - 50) * 0.5 + range(-5, 5), 30, 70),
          y: attackGoalY(side) - dir * range(8, 16),
          t: 1.6
        };
      }
    }
    setSit('corner', (side === 'home' ? cfg.homeShort : cfg.awayShort) + ' 코너킥', true);
    say('🚩 코너킥! ' + (side === 'home' ? '우리' : '상대') + ' 공격 — 박스 안으로 크로스가 올라갑니다.', 'tactic');
    void taker;
  }

  function freeKick(side, spotX, spotY) {
    var dir = goalDir(side);
    play.phase = 'setpiece';
    play.setpiece = { type: 'fk', side: side, t: 1.35 };
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    if (typeof spotX === 'number') { ball.x = spotX; }
    if (typeof spotY === 'number') { ball.y = spotY; }
    ball.x = clamp(ball.x, 8, 92);
    ball.y = clamp(ball.y, 8, 112);
    var taker = bestTaker(side, 'fk');
    if (taker) {
      taker.x = ball.x - 1.5;
      taker.y = ball.y + dir * 4;
      taker.tx = taker.x; taker.ty = taker.y;
    }
    setSit('fk', (side === 'home' ? cfg.homeShort : cfg.awayShort) + ' 프리킥', true);
    say('🎯 프리킥! ' + (side === 'home' ? '우리' : '상대') + ' 세트피스 기회입니다.', 'tactic');
  }

  function executeSetpiece(sp) {
    play.phase = 'play';
    play.setpiece = null;
    var side = sp.side;
    var dir = goalDir(side);
    var taker = bestTaker(side, sp.type === 'corner' ? 'ck' : 'fk');
    var scorer = bestBoxTarget(side);
    var dist = Math.abs(ball.y - attackGoalY(side));
    var xg, tx, ty, dur;

    if (sp.type === 'corner') {
      tx = clamp(50 + range(-6, 6), 36, 64);
      ty = attackGoalY(side) - dir * 11;
      xg = 0.12 + (side === 'home' && buffOf('setpiece') > 0 ? 0.05 : 0);
      dur = 0.72;
      bubble(taker || scorer, '🚩 코너 크로스!', '#ffd98a', 1.3);
    } else {
      var direct = dist < 30;
      xg = direct ? 0.11 + ((taker && taker.player.set.fk) || 5) / 260 : 0.09;
      tx = direct ? clamp(50 + range(-7, 7), 38, 62) : clamp(50 + range(-6, 6), 36, 64);
      ty = direct ? attackGoalY(side) : attackGoalY(side) - dir * 10;
      dur = direct ? 0.55 : 0.78;
      bubble(taker || scorer, direct ? '🔥 직접 슛!' : '🎯 세트피스 크로스!', '#ffb066', 1.3);
      if (side === 'home' && buffOf('setpiece') > 0) { xg += 0.05; }
    }
    var speed = Math.max(40, Math.hypot(tx - ball.x, ty - ball.y) / dur);
    var by = sp.type === 'corner' ? (scorer || taker) : (taker || scorer);
    kickBall(taker || by, tx, ty, speed, 'shot', null);
    ball.dur = dur;
    ball.shot = {
      by: by, xg: xg, onTarget: chance(0.55), isGoal: chance(clamp(xg, 0.02, 0.5)),
      long: dist > 26, tx: tx, gy: attackGoalY(side)
    };
    if (side === 'home') { goalStats.homeShots++; homeXg += xg; charge(1.2); }
    else { goalStats.awayShots++; awayXg += xg; }
    say(sp.type === 'corner' ? '크로스가 박스로 향합니다 — 헤딩 슛!' : '세트피스 슈팅!', 'shot');
  }

  /* ─────────────────────────  리셋  ───────────────────────── */
  function resetKickoff(side) {
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.x = p.baseX; p.y = p.baseY; p.tx = p.baseX; p.ty = p.baseY;
      p.stun = 0; p.diveT = 0; p.bubble = null; p.throughRun = null;
      p.mark = null; p.dribbleT = 0;
    }
    ball.x = 50; ball.y = WORLD_H / 2; ball.vx = 0; ball.vy = 0;
    ball.carrier = null; ball.from = null; ball.receiver = null;
    ball.kind = 'idle'; ball.shot = null; ball.trail = [];
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
    if (play.counterT > 0) { play.counterT -= dt; }
    if (play.recoverT > 0) { play.recoverT -= dt; }
    if (play.markT > 0) { play.markT -= dt; }
    if (play.passLine) {
      play.passLine.t -= dt;
      if (play.passLine.t <= 0) { play.passLine = null; }
    }
    for (i = 0; i < players.length; i++) {
      var pp = players[i];
      if (pp.bubble) { pp.bubble.t -= dt; if (pp.bubble.t <= 0) { pp.bubble = null; } }
      if (pp.skillT > 0) { pp.skillT -= dt; }
      if (pp.glow > 0) { pp.glow -= dt; }
      if (pp.diveT > 0) { pp.diveT -= dt; }
      if (pp.dribbleT > 0) { pp.dribbleT -= dt; }
      if (pp.throughRun) { pp.throughRun.t -= dt; if (pp.throughRun.t <= 0) { pp.throughRun = null; } }
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
    M.clock = Math.min(90, simTime / MATCH_SECONDS * 90);
    if (Math.floor(simTime * 2) % 2 === 0) { updateScoreboard(); }

    if (!halftimeDone && M.clock >= 45) {
      halftimeDone = true;
      M.paused = true;
      M.halftime = true;
      say('전반 종료! ' + M.homeScore + ' : ' + M.awayScore, 'big');
      say('선수들이 물을 들이킵니다. 하프타임에 교체를 준비하세요.', 'normal');
      if (cfg.onHalftime) { cfg.onHalftime(); }
      return;
    }
    if (M.clock >= 90) { endMatch(); return; }

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
      ball.flight = 0;
      var near = nearestOpponent(c, 4.0);
      if (near.player && near.dist < 3.1) { tryTackle(near.player, c, dt); }
      actionTimer -= dt;
      if (actionTimer <= 0 && ball.carrier === c) {
        actionTimer = 0.32 + Math.random() * 0.2;
        decide();
      }
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.flight += dt;
    if (ball.trail.length === 0) { ball.trail.push({ x: ball.x, y: ball.y }); }
    else {
      var last = ball.trail[ball.trail.length - 1];
      if (Math.hypot(last.x - ball.x, last.y - ball.y) > 0.8) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 16) { ball.trail.shift(); }
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
      ball.x = clamp(ball.x, 2, WORLD_W - 2);
      ball.y = clamp(ball.y, 2, WORLD_H - 2);
      throwIn();
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

  /* ─────────────────────────  그리기  ───────────────────────── */
  /* 필드 선수는 구단 유니폼, 골키퍼는 GK 전용 색으로 구분 */
  function kitOf(p) {
    if (p.pos === 'GK') { return { shirt: '#e0be36', shorts: '#1b2327', trim: '#f7f0cf' }; }
    return p.kit;
  }

  function spriteOf(p) {
    var kit = kitOf(p);
    var key = p.player.id + '|' + kit.shirt + '|' + (p.moving ? p.frame : 0) + '|' + (p.facing > 0 ? 1 : 0) + '|' + (p.player.pic || 0);
    if (spriteCache[key]) { return spriteCache[key]; }
    var c = DS.Art.sdSprite(p.player, kit, p.moving ? p.frame : 0, p.facing);
    spriteCache[key] = c;
    return c;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
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

  function drawPressZone() {
    if (buffOf('press') <= 0) { return; }
    var pc = pressConfig('home');
    var rr = pc.radius * (field.w / WORLD_W);
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#ff9f8a';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(sx(ball.x), sy(ball.y), rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPassLine() {
    var pl = play.passLine;
    if (!pl || pl.t <= 0) { return; }
    var a = clamp(pl.t / pl.t0, 0, 1);
    var x1 = sx(pl.x1), y1 = sy(pl.y1), x2 = sx(pl.x2), y2 = sy(pl.y2);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var nx = -(y2 - y1), ny = (x2 - x1);
    var len = Math.hypot(nx, ny) || 1;
    var bend = Math.min(16, len * 0.10);
    mx += nx / len * bend; my += ny / len * bend;
    ctx.save();
    ctx.globalAlpha = 0.35 + a * 0.6;
    ctx.strokeStyle = pl.color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    var ang = Math.atan2(y2 - my, x2 - mx);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 5 * Math.cos(ang - 0.4), y2 - 5 * Math.sin(ang - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 5 * Math.cos(ang + 0.4), y2 - 5 * Math.sin(ang + 0.4));
    ctx.stroke();
    ctx.restore();
  }

  function drawShotTrail() {
    if (ball.kind !== 'shot' || ball.trail.length < 2) { return; }
    var i, t, x, y, r;
    var longShot = ball.shot && ball.shot.long;
    for (i = 0; i < ball.trail.length; i++) {
      t = i / ball.trail.length;
      x = sx(ball.trail[i].x); y = sy(ball.trail[i].y);
      r = 2.6 + t * 3.4;
      ctx.beginPath();
      var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, longShot ? 'rgba(255,236,140,' + (0.55 * t) + ')' : 'rgba(255,200,120,' + (0.45 * t) + ')');
      gr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gr;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (longShot) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,248,190,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (i = 1; i < ball.trail.length; i++) {
        var px = sx(ball.trail[i].x), py = sy(ball.trail[i].y);
        if (i === 1) { ctx.moveTo(px, py); }
        else { ctx.lineTo(px + (i % 2 ? 2.4 : -2.4), py + (i % 2 ? -2 : 2)); }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBubble(p, px, py, sprH) {
    var b = p.bubble;
    if (!b) { return; }
    var a = clamp(b.t / 0.35, 0, 1);
    var txt = b.text;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '800 8px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(txt).width;
    var bw = tw + 12, bh = 14;
    var rise = (1 - clamp(b.t / b.t0, 0, 1)) * 4;
    var bx = px - bw / 2, by = py - sprH - 9 - rise;
    if (bx < 2) { bx = 2; }
    if (bx + bw > W - 2) { bx = W - 2 - bw; }
    if (by < 2) { by = 2; }
    ctx.fillStyle = 'rgba(6, 24, 20, 0.88)';
    roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1;
    roundRect(bx, by, bw, bh, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 3.5, by + bh);
    ctx.lineTo(px, by + bh + 4);
    ctx.lineTo(px + 3.5, by + bh);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 24, 20, 0.88)';
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  }

  function draw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, W, H);
    if (pitchLayer) { ctx.drawImage(pitchLayer, 0, 0, W, H); }
    else { DS.Art.drawPitch(ctx, W, H, { crowd: true }); }

    drawPressZone();
    drawPassLine();
    drawShotTrail();

    var sprH = clamp(W * 0.134, 40, 54);
    var arr = players.slice().sort(function (a, b) { return a.y - b.y; });
    var i, p, px, py, sprite, offY, dx, dy;

    for (i = 0; i < arr.length; i++) {
      p = arr[i];
      px = sx(p.x); py = sy(p.y);
      offY = 0;

      /* 그림자 */
      ctx.fillStyle = 'rgba(4,20,16,0.34)';
      ctx.beginPath();
      ctx.ellipse(px, py - 0.5, sprH * 0.29, sprH * 0.095, 0, 0, Math.PI * 2);
      ctx.fill();

      /* 발밑 아우라 링 (스킬·카드 발동) */
      if ((p.skillT > 0 || p.glow > 0) && p.side === 'home') {
        var aa = clamp(Math.max(p.skillT, p.glow), 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.35 + aa * 0.45;
        ctx.strokeStyle = p.side === 'home' ? '#c8f169' : '#ff8c78';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(px, py - 0.5, sprH * 0.33, sprH * 0.125, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.13 + aa * 0.14;
        ctx.fillStyle = p.side === 'home' ? '#c8f169' : '#ff8c78';
        ctx.beginPath();
        ctx.ellipse(px, py - 0.5, sprH * 0.33, sprH * 0.125, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (ball.carrier === p) {
        ctx.strokeStyle = p.side === 'home' ? 'rgba(200,241,105,0.95)' : 'rgba(255,140,120,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(px, py - 0.5, sprH * 0.32, sprH * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      sprite = spriteOf(p);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if (p.diveT > 0) {
        var dk = clamp(1 - p.diveT / 0.7, 0, 1);
        var ang = p.diveDir * Math.sin(dk * Math.PI * 0.62) * 1.18;
        offY = -Math.sin(dk * Math.PI) * 5;
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.translate(-px, -py);
      }
      ctx.drawImage(sprite,
        Math.round(px - sprH * 0.355),
        Math.round(py - sprH + 4 + offY),
        Math.round(sprH * 0.71), Math.round(sprH));
      ctx.restore();

      /* 홈 팀 공 소유자 이름 */
      if (p.side === 'home' && ball.carrier === p) {
        ctx.font = '600 8px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        var label = short(p.name);
        var tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(8,32,27,0.78)';
        roundRect(px - tw / 2, py + 1, tw, 11, 5.5);
        ctx.fill();
        ctx.fillStyle = '#eaffd0';
        ctx.fillText(label, px, py + 9);
      }
    }

    /* 스킬 태그 말풍선 */
    for (i = 0; i < arr.length; i++) {
      p = arr[i];
      if (!p.bubble) { continue; }
      drawBubble(p, sx(p.x), sy(p.y), sprH);
    }

    /* 볼 */
    var bx = sx(ball.x), by = sy(ball.y);
    var ballY = by - Math.min(8, Math.abs(ball.vy) * 0.035) - 2.5;
    if (ball.kind === 'shot') {
      var gr2 = ctx.createRadialGradient(bx, ballY, 1, bx, ballY, 12);
      gr2.addColorStop(0, 'rgba(255,236,150,0.75)');
      gr2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr2;
      ctx.beginPath(); ctx.arc(bx, ballY, 12, 0, Math.PI * 2); ctx.fill();
    }
    DS.Art.drawBall(ctx, bx, ballY, Math.max(3.4, W / 105));

    /* 시간 오버레이 */
    ctx.fillStyle = 'rgba(6,26,22,0.78)';
    roundRect(W - 56, H - 24, 50, 18, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(200,241,105,0.5)';
    ctx.lineWidth = 1; roundRect(W - 56, H - 24, 50, 18, 9); ctx.stroke();
    ctx.fillStyle = '#d6ff8a';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((minute() < 10 ? '0' : '') + minute() + "'", W - 31, H - 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    void dx; void dy;

    if (M.halftime && M.running) {
      ctx.fillStyle = 'rgba(4,20,16,0.55)';
      ctx.fillRect(0, H / 2 - 20, W, 40);
      ctx.fillStyle = '#d6ff8a';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HALF TIME', W / 2, H / 2 + 5);
      ctx.textAlign = 'left';
    }
  }

  /* 검증용 상태 조회 (포메이션·전술·카드가 실제 좌표에 반영됐는지) */
  M.probe = function () {
    var i, p, h = [], a = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      var row = {
        pos: p.pos, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
        tx: Math.round(p.tx), ty: Math.round(p.ty), kind: p.kind,
        bubble: p.bubble ? p.bubble.text : null
      };
      if (p.side === 'home') { h.push(row); } else { a.push(row); }
    }
    var pcs = pressConfig('home');
    return {
      clock: minute(), phase: play.phase, stage: play.stage, sit: play.sitKey, paused: M.paused, halftime: M.halftime,
      ball: { x: Math.round(ball.x), y: Math.round(ball.y), kind: ball.kind, shot: !!ball.shot },
      passLine: play.passLine ? true : false,
      formation: {
        home: formationOf('home'), away: formationOf('away'), tactic: tactic,
        lineHome: Math.round(lineYOf('home')), lineAway: Math.round(lineYOf('away')),
        pressHome: Math.round(pcs.press), pressers: pcs.n
      },
      buffs: (function () { var o = [], k; for (k in buffs) { if (buffs[k] > 0) { o.push(k); } } return o; })(),
      home: h, away: a
    };
  };

  DS.Match = M;

})(window);
