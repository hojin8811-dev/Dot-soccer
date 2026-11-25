/*! 도트싸커 × 포켓리그 v2 — 도트 경기장 실시간 시뮬레이션 (match.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var rnd = U.rnd, range = U.range, chance = U.chance, clamp = U.clamp, pick = U.pick;

  var WORLD_W = 100;
  var WORLD_H = 120;
  var MATCH_SECONDS = 92;      /* ×1 배속에서 92초에 90분 경기 */
  var MAX_SUBS = 5;

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
  var W = 390, H = 460, dpr = 1;
  var field = { x: 6, y: 6, w: 378, h: 448 };
  var pitchLayer = null;

  var players = [];
  var ball = { x: 50, y: 60, vx: 0, vy: 0, carrier: null, shotBy: null, target: null };
  var cfg = null;
  var ratings = [];
  var benchState = [];
  var lastT = 0;
  var rafId = 0;
  var acc = 0;
  var simTime = 0;
  var phaseTimer = 0;
  var actionTimer = 0;
  var fillerTimer = 0;
  var halftimeDone = false;
  var tactic = 'balanced';
  var goalStats = { homeShots: 0, awayShots: 0 };
  var stats = { passes: 0, tackles: 0, saves: 0 };
  var spriteCache = {};
  var lastTouchName = '';
  var lastScorerSide = 'home';
  var looseTimer = 0;
  var goals = [];
  var cautions = [];
  var possession = { home: 0.001, away: 0.001 };
  var halfScore = [[0, 0], [0, 0]];
  var formFactor = 1;

  /* ─────────────────────────  좌표  ───────────────────────── */
  function sx(x) { return field.x + (x / WORLD_W) * field.w; }
  function sy(y) { return field.y + (y / WORLD_H) * field.h; }
  function goalDir(side) { return side === 'home' ? -1 : 1; }
  function ownGoalY(side) { return side === 'home' ? WORLD_H : 0; }
  function attackGoalY(side) { return side === 'home' ? 0 : WORLD_H; }
  function short(n) { return n && n.length > 3 ? n.slice(1) : n; }

  /* ─────────────────────────  초기화  ───────────────────────── */
  function makeHomePlayers(lineup) {
    var out = [], i;
    for (i = 0; i < lineup.length; i++) {
      var s = lineup[i];
      out.push(mkPlayer('home', s.player, cfg.homeKit, s.role, s.pos, s.x, s.y));
    }
    return out;
  }

  function mkPlayer(side, player, kit, role, pos, x, y) {
    var bx = side === 'home' ? x : 100 - x;
    var by = side === 'home' ? y * 1.2 : 120 - y * 1.2;
    return {
      side: side, player: player, kit: kit, role: role, pos: pos,
      baseX: bx, baseY: by, x: bx, y: by, tx: bx, ty: by,
      vx: 0, vy: 0, phase: Math.random() * 4, frame: 0,
      facing: side === 'home' ? 1 : -1, dive: 0, stun: 0,
      goals: 0, assists: 0, yellows: 0, name: player.name, off: false,
      moving: false
    };
  }

  function makeAwayPlayers(list) {
    var slots = DS.FORMATIONS['4-4-2'].slots;
    var out = [], i;
    for (i = 0; i < list.length; i++) {
      var s = slots[i] || { role: 'ST', pos: 'FW', x: 50, y: 40 };
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

  /* ─────────────────────────  시작 · 종료  ───────────────────────── */
  M.start = function (config) {
    cfg = config;
    canvas = document.getElementById('m-pitch');
    if (!canvas) { return; }
    ctx = canvas.getContext('2d');
    players = makeHomePlayers(cfg.lineup).concat(makeAwayPlayers(cfg.awayPlayers));
    benchState = (cfg.bench || []).map(function (b) {
      return { player: b.player, pos: b.player.pos, rating: DS.ratingOf(b.player), used: false };
    });
    initRatings();
    M.homeScore = 0; M.awayScore = 0; M.clock = 0;
    M.subsLeft = MAX_SUBS;
    M.paused = false;
    simTime = 0; acc = 0;
    goalStats = { homeShots: 0, awayShots: 0 };
    stats = { passes: 0, tackles: 0, saves: 0 };
    goals = []; cautions = [];
    possession = { home: 0.001, away: 0.001 };
    halfScore = [[0, 0], [0, 0]];
    halftimeDone = false;
    tactic = cfg.tactics || 'balanced';
    formFactor = 0.94 + clamp((cfg.condition || 80) / 900, 0, 0.12);
    spriteCache = {};
    updateScoreboard();
    clearCommentary();
    resize();
    resetKickoff(Math.random() < 0.5 ? 'home' : 'away');
    M.running = true;
    M.phase = 'play';
    lastT = 0;
    say('휘슬이 울립니다! ' + cfg.homeName + ' 대 ' + cfg.awayName + ', 경기 시작!', 'big');
    say('오늘 중계는 도트싸커 중계석에서 전해드립니다.', 'normal');
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  };

  M.setSpeed = function (n) { M.speed = clamp(n, 1, 3); };
  M.setTactics = function (t) {
    tactic = t;
    var line = t === 'attack' ? '전술을 공격적으로! 최전방까지 올라갑니다!' :
      (t === 'defense' ? '전술을 수비적으로! 라인을 내립니다.' : '균형 전술로 안정을 찾습니다.');
    say(line, 'tactic');
  };
  M.pause = function () { M.paused = true; };
  M.resume = function (quiet) {
    M.paused = false;
    lastT = 0;
    if (!quiet) { say('후반전 시작! 다시 공을 굴립니다.', 'big'); }
  };
  M.stats = function () {
    return {
      passes: stats.passes, tackles: stats.tackles, saves: stats.saves,
      shots: goalStats, cautions: cautions.length, goals: goals.length, minute: minute()
    };
  };
  M.stop = function () {
    M.running = false;
    cancelAnimationFrame(rafId);
  };

  /* 교체 정보 */
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
    var newP = mkPlayer('home', inB.player, cfg.homeKit, outP.role, inB.player.pos, outP.baseX, outP.baseY);
    newP.x = outP.x; newP.y = outP.y; newP.tx = outP.x; newP.ty = outP.y;
    newP.role = outP.role;
    /* 필드에서 교체 */
    var idx = players.indexOf(outP);
    players.splice(idx, 1, newP);
    inB.used = true;
    M.subsLeft--;
    /* 평점표 갱신 */
    for (i = 0; i < ratings.length; i++) {
      if (ratings[i].id === outId) {
        ratings[i].rating = clamp(ratings[i].rating - 0.3, 3.5, 10);
        ratings[i].subbedOut = true;
      }
    }
    ratings.push({
      id: inB.player.id, name: inB.player.name, role: outP.role, pos: inB.player.pos,
      goals: 0, assists: 0, rating: 6.0, mvp: false
    });
    if (ball.carrier === outP) { ball.carrier = null; looseBall(outP.x, outP.y, 0, 0); }
    say('🔁 교체! ' + short(outP.name) + ' 나가고 ' + short(inB.player.name) + ' 투입됩니다. (' + minute() + "')", 'tactic');
    return true;
  };

  /* ─────────────────────────  레이아웃  ───────────────────────── */
  M.resize = resize;
  function resize() {
    if (!canvas) { return; }
    var rect = canvas.parentNode.getBoundingClientRect();
    W = Math.max(280, Math.round(rect.width));
    H = Math.max(240, Math.round(rect.height));
    dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var pm = DS.Art.pitchMargin(W, H);
    field = { x: pm, y: pm, w: W - pm * 2, h: H - pm * 2 };
    buildPitchLayer();
  }

  function buildPitchLayer() {
    pitchLayer = document.createElement('canvas');
    pitchLayer.width = Math.round(W * dpr);
    pitchLayer.height = Math.round(H * dpr);
    var g = pitchLayer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    DS.Art.drawPitch(g, W, H, { margin: field.x, crowd: true });
  }

  /* ─────────────────────────  중계  ───────────────────────── */
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
    phaseTimer = 3.4;
  }
  function updateScoreboard() {
    var a = document.getElementById('m-gf'), b = document.getElementById('m-ga'), c = document.getElementById('m-clock');
    if (a) { a.textContent = M.homeScore; }
    if (b) { b.textContent = M.awayScore; }
    if (c) { c.textContent = (minute() < 10 ? '0' : '') + minute() + "'"; }
  }

  /* ─────────────────────────  포지셔닝  ───────────────────────── */
  function tacticShift(side) {
    var t = side === 'home' ? tactic : 'balanced';
    var v = t === 'attack' ? 7 : (t === 'defense' ? -7 : 0);
    return side === 'home' ? v * -1 : v;
  }
  function isGK(p) { return p.pos === 'GK'; }
  function carrierOf() { return ball.carrier; }
  function goalkeeper(side) {
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === side && players[i].pos === 'GK' && !players[i].off) { return players[i]; }
    }
    return null;
  }
  function nearestOpponent(p, maxDist) {
    var best = null, bd = maxDist || 999, i, q, d;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === p.side) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return { player: best, dist: bd };
  }
  function nearestToBall(side, maxD) {
    var best = null, bd = maxD || 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== side) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    return best;
  }

  function updateTargets() {
    var i, p, shift, near, carrier = ball.carrier;
    var chase = [], looseChase = [];
    if (!carrier) {
      var hq = nearestToBall('home', 999), aq = nearestToBall('away', 999);
      if (hq) { looseChase.push(hq); }
      if (aq) { looseChase.push(aq); }
    }
    if (carrier) {
      var defSide = carrier.side === 'home' ? 'away' : 'home';
      var cand = players.filter(function (q) { return q.side === defSide && q.pos !== 'GK'; });
      cand.sort(function (a, b) {
        return Math.hypot(a.x - carrier.x, a.y - carrier.y) - Math.hypot(b.x - carrier.x, b.y - carrier.y);
      });
      chase = cand.slice(0, 2);
    }
    for (i = 0; i < players.length; i++) {
      p = players[i];
      shift = tacticShift(p.side);
      if (isGK(p)) {
        p.tx = clamp(ball.x, 42, 58);
        p.ty = p.side === 'home' ? WORLD_H - 6 : 6;
        continue;
      }
      if (p === carrier) {
        var gy = attackGoalY(p.side);
        p.tx = clamp(p.x + (50 - p.x) * 0.25, 8, 92);
        p.ty = p.y + goalDir(p.side) * 12;
        if (Math.abs(p.y - gy) < 16) { p.tx = 50 + (p.x - 50) * 0.5; }
        continue;
      }
      if (looseChase.indexOf(p) >= 0) { p.tx = ball.x; p.ty = ball.y; continue; }
      if (chase.indexOf(p) >= 0) {
        p.tx = carrier.x + carrier.vx * 0.12;
        p.ty = carrier.y + carrier.vy * 0.12;
        continue;
      }
      var bx = p.baseX + (ball.x - 50) * (p.pos === 'DF' ? 0.20 : (p.pos === 'MF' ? 0.34 : 0.22));
      var by = p.baseY + (ball.y - WORLD_H / 2) * (p.pos === 'DF' ? 0.16 : (p.pos === 'MF' ? 0.26 : 0.20)) + shift;
      if (p.pos === 'FW' && carrier && carrier.side === p.side) { by += goalDir(p.side) * 5; }
      p.tx = clamp(bx, 5, 95);
      p.ty = clamp(by, 4, WORLD_H - 4);
    }
  }

  function movePlayer(p, dt) {
    var spd = 9.5 + (p.player.stats.spd / 99) * 8.5;
    if (p.pos === 'GK') { spd = 11 + p.player.stats.spd / 40; }
    if (p.stun > 0) { p.stun -= dt; spd *= 0.35; }
    var dx = p.tx - p.x, dy = p.ty - p.y;
    var d = Math.hypot(dx, dy);
    if (d > 0.4) {
      var step = Math.min(d, spd * dt);
      p.vx = (dx / d) * spd;
      p.vy = (dy / d) * spd;
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.phase += dt * (6 + spd * 0.25);
      p.frame = Math.floor(p.phase) % 4;
      if (Math.abs(dx) > 0.6) { p.facing = dx > 0 ? 1 : -1; }
      p.moving = true;
    } else {
      p.vx = 0; p.vy = 0; p.moving = false; p.frame = 0;
    }
    p.x = clamp(p.x, 2, WORLD_W - 2);
    p.y = clamp(p.y, 2, WORLD_H - 2);
  }

  function separate() {
    var i, j, a, b, dx, dy, d, minD = 3.1;
    for (i = 0; i < players.length; i++) {
      a = players[i];
      for (j = i + 1; j < players.length; j++) {
        b = players[j];
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.hypot(dx, dy);
        if (d > 0.01 && d < minD) {
          var push = (minD - d) * 0.35;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  /* ─────────────────────────  볼  ───────────────────────── */
  function giveBall(p) {
    if (ball.carrier && ball.carrier !== p) { ball.carrier.stun = 0.12; }
    ball.carrier = p;
    ball.shotBy = null;
    ball.target = null;
    ball.vx = 0; ball.vy = 0;
    ball.flight = 0;
    looseTimer = 0;
    lastTouchName = p.name;
    actionTimer = 0.25 + Math.random() * 0.3;
  }
  function looseBallPublic(x, y, vx, vy) { looseBall(x, y, vx, vy); }
  function looseBall(x, y, vx, vy) {
    ball.carrier = null;
    ball.x = x; ball.y = y;
    ball.vx = vx || 0; ball.vy = vy || 0;
  }

  function pickPassTarget(p) {
    var best = null, bestScore = -999, i, q, d, forward, oppNear;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== p.side || q === p || q.pos === 'GK') { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 8 || d > 42) { continue; }
      forward = (p.y - q.y) * -goalDir(p.side);
      oppNear = nearestOpponent(q, 6).dist;
      var score = forward * 1.1 + (oppNear < 6 ? -14 : oppNear * 1.2) - d * 0.12 + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  }

  function passBall(p) {
    var t = pickPassTarget(p);
    if (!t) { return false; }
    var tx = t.x + t.vx * 0.25 + (t.tx - t.x) * 0.16;
    var ty = t.y + t.vy * 0.25 + (t.ty - t.y) * 0.16;
    var ang = Math.atan2(ty - ball.y, tx - ball.x);
    var dist = Math.hypot(tx - ball.x, ty - ball.y);
    var speed = clamp(dist * 2.1, 34, 62);
    ball.carrier = null;
    ball.shotBy = null;
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.target = t;
    ball.passBy = p;
    ball.flight = 0;
    M.phase = 'pass';
    stats.passes++;
    p.passTarget = t;
    if (chance(0.4)) {
      say(pick([
        U.josa(short(p.name), '이/가') + ' 짧은 패스로 연결합니다!',
        U.josa(short(p.name), '이/가') + ' 전진 패스를 찔러 넣습니다!',
        '패스 한 번에 수비 라인이 흔들립니다!',
        U.josa(short(p.name), '의') + ' 감각적인 원터치 패스!'
      ]), 'normal');
    }
    return true;
  }

  function shoot(p) {
    var gy = attackGoalY(p.side);
    var acc = 0.40 + p.player.stats.atk / 320 + (p.side === 'home' ? (formFactor - 1) * 0.6 : 0);
    var onTarget = chance(clamp(acc, 0.2, 0.7));
    var tx = onTarget ? range(45.5, 54.5) : (chance(0.5) ? range(32, 43) : range(57, 68));
    var ang = Math.atan2(gy - ball.y, tx - ball.x);
    var dist = Math.hypot(tx - ball.x, gy - ball.y);
    var speed = clamp(dist * 2.6, 58, 108);
    ball.carrier = null;
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.shotBy = p;
    ball.target = null;
    ball.onTarget = onTarget;
    ball.flight = 0;
    M.phase = 'shot';
    if (p.side === 'home') { goalStats.homeShots++; } else { goalStats.awayShots++; }
    say(U.josa(short(p.name), '이/가') + ' 과감하게 슛! ' + pick([
      '발끝에서 불꽃이 튑니다!', '각도가 좁은데도 밀어 넣습니다!',
      '수비수 머리 위로 감아 찹니다!', '있는 힘껏 때렸습니다!'
    ]), 'shot');
  }

  function decide() {
    var p = ball.carrier;
    if (!p) { return; }
    var gy = attackGoalY(p.side);
    var distToGoal = Math.abs(p.y - gy);
    var near = nearestOpponent(p, 12);
    var pressure = near.dist < 5.5;
    var tac = p.side === 'home' ? tactic : 'balanced';
    var shootRange = tac === 'attack' ? 30 : (tac === 'defense' ? 22 : 26);
    if (distToGoal < shootRange && chance(tac === 'attack' ? 0.62 : 0.44)) { shoot(p); return; }
    if (pressure) {
      if (chance(0.72)) { if (passBall(p)) { return; } }
      p.tx = p.x + range(-6, 6);
      p.ty = p.y + goalDir(p.side) * 9;
      if (chance(0.25)) { say(U.josa(short(p.name), '이/가') + ' 압박을 등지고 드리블 돌파!', 'normal'); }
      return;
    }
    if (chance(0.34)) { passBall(p); return; }
    if (distToGoal < shootRange + 10 && chance(0.16)) { shoot(p); return; }
  }

  /* ─────────────────────────  골 · 경고 · 세이브  ───────────────────────── */
  function goal(scorer, side) {
    var i;
    var mn = minute();
    var half = mn < 45 ? 0 : 1;
    if (side === 'home') {
      M.homeScore++;
      halfScore[half][0]++;
      addRating(scorer, 1.05 + scoringBonus(scorer));
    } else {
      M.awayScore++;
      halfScore[half][1]++;
      for (i = 0; i < players.length; i++) {
        if (players[i].side === 'home' && (players[i].pos === 'GK' || players[i].pos === 'DF')) { addRating(players[i], -0.12); }
      }
    }
    lastScorerSide = side;
    var r = ratingOf(scorer);
    if (r) { r.goals++; }
    var assistName = '';
    if (side === 'home' && ball.passBy && ball.passBy !== scorer) {
      var ar = ratingOf(ball.passBy);
      if (ar) { ar.assists++; ar.rating = clamp(ar.rating + 0.55, 3.5, 10); assistName = ball.passBy.name; }
    }
    goals.push({ min: mn, half: half, side: side, name: scorer.name, assist: assistName });
    updateScoreboard();
    var isHome = side === 'home';
    banner('GOAL!', short(scorer.name) + (isHome ? ' ⚽ ' + cfg.homeName : ' · ' + cfg.awayName));
    say((isHome ? '⚽ GOAL!! ' : '😱 실점... ') + U.josa(short(scorer.name), '이/가') + ' 골망을 흔듭니다! ' + pick([
      '관중석이 들썩입니다!', '완벽한 마무리였습니다!', '골키퍼가 손을 쓸 수 없었습니다!', '중계석도 목이 쉬겠습니다!'
    ]), 'goal');
    say(M.homeScore + ' : ' + M.awayScore + ' — ' + pick(['경기의 흐름이 바뀝니다!', '집중력이 필요합니다!', '아직 경기는 끝나지 않았습니다!']), 'normal');
    M.phase = 'celebrate';
    phaseTimer = 3.4;
    ball.carrier = null;
    ball.vx = 0; ball.vy = 0;
    ball.x = 50; ball.y = WORLD_H / 2;
  }

  function scoringBonus(p) {
    var d = Math.abs(p.y - attackGoalY(p.side));
    if (d > 30) { return 0.35; }
    if (d > 18) { return 0.2; }
    return 0;
  }

  function save(gk) {
    stats.saves++;
    addRating(gk, 0.55);
    say('🧤 ' + U.josa(short(gk.name), '이/가') + ' 슈퍼 세이브! ' + pick([
      '새끼손가락으로 쳐냅니다!', '몸을 날려 막아냅니다!', '반사 신경이 미쳤습니다!', '골문을 닫아버립니다!'
    ]), 'save');
  }

  function resolveShot() {
    var p = ball.shotBy;
    if (!p) { return; }
    var defSide = p.side === 'home' ? 'away' : 'home';
    var gk = goalkeeper(defSide);
    var gkDef = gk ? gk.player.stats.def : 55;
    var atk = p.player.stats.atk;
    var dist = Math.abs(p.y - attackGoalY(p.side));
    if (!ball.onTarget) {
      say('아쉽습니다! ' + U.josa(short(p.name), '의') + ' 슛이 골대를 벗어납니다.', 'miss');
      addRating(p, -0.05);
      looseBall(50, defSide === 'home' ? WORLD_H : 0, 0, 0);
      goalKick(defSide);
      return;
    }
    var saveProb = clamp(0.34 + gkDef / 200 + (dist > 20 ? 0.16 : 0) - atk / 560, 0.12, 0.70);
    if (gk) { gk.dive = 1; }
    if (chance(saveProb)) {
      if (gk) { save(gk); }
      addRating(p, -0.02);
      looseBall(50 + range(-4, 4), ownGoalY(defSide) + (defSide === 'home' ? -8 : 8), 0, 0);
      goalKick(defSide);
    } else {
      goal(p, p.side);
    }
  }

  function goalKick(side) {
    var gk = goalkeeper(side);
    M.phase = 'play';
    phaseTimer = 0;
    if (gk) { ball.x = gk.x; ball.y = gk.y; giveBall(gk); }
    else { var q = nearestToBall(side); if (q) { giveBall(q); } }
    say(side === 'home' ? '우리 진영에서 다시 시작합니다.' : '상대 골킥으로 재개합니다.', 'normal');
  }

  function caution(p) {
    p.yellows = (p.yellows || 0) + 1;
    cautions.push({ min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name });
    if (p.yellows >= 2) {
      p.off = true;
      say('🟨🟨 ' + U.josa(short(p.name), '이/가') + ' 경고 누적으로 퇴장! 수적 열세입니다.', 'tackle');
      var i = players.indexOf(p);
      if (i >= 0) { players.splice(i, 1); }
      if (ball.carrier === p) { looseBall(p.x, p.y, 0, 0); }
      var r = ratingOf(p);
      if (r) { r.rating = clamp(r.rating - 1.2, 3.5, 10); }
    } else {
      say('🟨 ' + U.josa(short(p.name), '에게') + ' 경고 카드가 주어집니다.', 'tackle');
      addRating(p, -0.2);
    }
  }

  function tackle(defender, carrier) {
    /* 파울 판정 */
    var foulP = clamp(0.16 + (defender.player.tough < 4 ? 0.06 : 0) - (defender.player.traits === 'cool' ? 0.06 : 0), 0.06, 0.3);
    if (chance(foulP)) {
      say('🦵 ' + U.josa(short(defender.name), '의') + ' 거친 태클! 휘슬이 울립니다.', 'tackle');
      if (chance(0.55)) { caution(defender); }
      giveBall(carrier);
      carrier.stun = 0;
      return;
    }
    stats.tackles++;
    addRating(defender, 0.18);
    addRating(carrier, -0.06);
    carrier.stun = 0.35;
    giveBall(defender);
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 태클! ' + pick([
      '깔끔하게 공을 빼앗습니다!', '몸을 던져 길을 막습니다!', '주머니에 손 넣듯 빼앗아 갑니다!'
    ]), 'tackle');
  }

  /* ─────────────────────────  리셋  ───────────────────────── */
  function resetKickoff(side) {
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.x = p.baseX; p.y = p.baseY; p.tx = p.baseX; p.ty = p.baseY;
      p.stun = 0; p.dive = 0;
    }
    ball.x = 50; ball.y = WORLD_H / 2; ball.vx = 0; ball.vy = 0;
    ball.shotBy = null; ball.passBy = null; ball.target = null;
    var starter = null;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === side && players[i].pos === 'MF') { starter = players[i]; break; }
    }
    if (!starter) {
      for (i = 0; i < players.length; i++) {
        if (players[i].side === side && players[i].pos !== 'GK') { starter = players[i]; break; }
      }
    }
    if (starter) { starter.x = 50; starter.y = WORLD_H / 2 + goalDir(side) * 4; giveBall(starter); }
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
      while (acc >= stepDt && guard < 12) { step(stepDt); acc -= stepDt; guard++; }
    }
    draw();
    if (M.running) { rafId = requestAnimationFrame(loop); }
  }

  function step(dt) {
    if (M.phase === 'ended') { return; }
    if (M.phase === 'celebrate') {
      phaseTimer -= dt;
      if (phaseTimer <= 0) {
        var el = document.getElementById('m-banner');
        if (el) { el.classList.remove('on'); }
        resetKickoff(lastScorerSide === 'home' ? 'away' : 'home');
      }
      updateTargets();
      var k;
      for (k = 0; k < players.length; k++) { movePlayer(players[k], dt); }
      separate();
      return;
    }

    simTime += dt;
    M.clock = Math.min(90, simTime / MATCH_SECONDS * 90);
    if (Math.floor(simTime * 2) % 2 === 0) { updateScoreboard(); }

    /* 하프타임 */
    if (!halftimeDone && M.clock >= 45) {
      halftimeDone = true;
      M.paused = true;
      say('전반 종료! ' + M.homeScore + ' : ' + M.awayScore, 'big');
      say('선수들이 물을 들이킵니다. 하프타임에 교체를 준비하세요.', 'normal');
      if (cfg.onHalftime) { cfg.onHalftime(); }
      return;
    }
    if (M.clock >= 90) { endMatch(); return; }

    updateTargets();
    var i;
    for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
    separate();

    if (ball.carrier) {
      var c = ball.carrier;
      possession[c.side] += dt;
      ball.x = c.x + (50 - c.x) * 0.02;
      ball.y = c.y + goalDir(c.side) * 1.6;
      var near = nearestOpponent(c, 4.2);
      if (near.player && near.dist < 3.75) {
        var def = near.player;
        var defSkill = def.player.stats.def + 8;
        var atkSkill = c.player.stats.spd + c.player.stats.atk * 0.3;
        var pTackle = clamp(1.6 * (defSkill / (defSkill + atkSkill)) * dt * 3.2, 0, 0.5);
        if (chance(pTackle)) { tackle(def, c); }
      }
      actionTimer -= dt;
      if (actionTimer <= 0 && ball.carrier) {
        actionTimer = 0.32 + Math.random() * 0.25;
        decide();
      }
    } else {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= (1 - 1.0 * dt);
      ball.vy *= (1 - 1.0 * dt);
      ball.flight = (ball.flight || 0) + dt;

      if (ball.flight > 2.8) {
        if (M.phase === 'shot') { ball.flight = 0; resolveShot(); return; }
        M.phase = 'play';
        var c1 = nearestToBall('home', 999), c2 = nearestToBall('away', 999);
        var loser = c1;
        if (!c1) { loser = c2; }
        else if (c2) {
          var d1 = Math.hypot(c1.x - ball.x, c1.y - ball.y);
          var d2 = Math.hypot(c2.x - ball.x, c2.y - ball.y);
          loser = d1 <= d2 ? c1 : c2;
        }
        ball.flight = 0;
        if (loser) { giveBall(loser); } else { looseTimer += dt; }
        return;
      }
      if (!ball.target) { looseTimer += dt; } else { looseTimer = 0; }

      if (M.phase === 'shot') {
        var gkSide = ball.shotBy ? (ball.shotBy.side === 'home' ? 'away' : 'home') : 'home';
        var gk2 = goalkeeper(gkSide);
        if (gk2 && Math.hypot(gk2.x - ball.x, gk2.y - ball.y) < 4.2) { resolveShot(); }
        else if ((ball.shotBy && ball.shotBy.side === 'home' && ball.y <= 2) ||
                 (ball.shotBy && ball.shotBy.side === 'away' && ball.y >= WORLD_H - 2) ||
                 ball.x < 1 || ball.x > WORLD_W - 1) { resolveShot(); }
      } else if (M.phase === 'pass') {
        var tgt = ball.target;
        if (tgt && Math.hypot(tgt.x - ball.x, tgt.y - ball.y) < 2.6) {
          giveBall(tgt);
          if (ball.passBy) {
            var pr = ratingOf(ball.passBy);
            if (pr) { pr.rating = clamp(pr.rating + 0.03, 3.5, 10); }
            addRating(tgt, 0.02);
          }
          M.phase = 'play';
        }
        var i2;
        for (i2 = 0; i2 < players.length && !ball.carrier; i2++) {
          var q = players[i2];
          if (ball.passBy && q.side === ball.passBy.side) { continue; }
          if (Math.hypot(q.x - ball.x, q.y - ball.y) < 2.2 && chance(0.5 * dt * 4)) {
            giveBall(q);
            M.phase = 'play';
            say(U.josa(short(q.name), '이/가') + ' 패스를 읽고 차단합니다!', 'tackle');
            break;
          }
        }
        if (!ball.target) { M.phase = 'play'; }
      } else {
        var nearHome = nearestToBall('home', 3), nearAway = nearestToBall('away', 3);
        if (nearHome && nearAway) { giveBall(chance(0.5) ? nearHome : nearAway); }
        else if (nearHome) { giveBall(nearHome); }
        else if (nearAway) { giveBall(nearAway); }
      }
      if (ball.y < 0 || ball.y > WORLD_H || ball.x < 0 || ball.x > WORLD_W) {
        ball.x = clamp(ball.x, 2, WORLD_W - 2);
        ball.y = clamp(ball.y, 2, WORLD_H - 2);
        ball.vx = 0; ball.vy = 0;
        if (M.phase !== 'shot') { M.phase = 'play'; }
      }
    }

    fillerTimer -= dt;
    if (fillerTimer <= 0) {
      fillerTimer = 7 + Math.random() * 6;
      if (ball.carrier && chance(0.55)) {
        say(pick([
          '중원에서 치열한 공방전이 이어집니다.', '양 팀 모두 물러서지 않습니다.',
          U.josa(short(ball.carrier.name), '이/가') + ' 공을 지키고 있습니다.',
          '패스 한 번, 패스 한 번 — 호흡이 좋습니다.',
          '벤치에서도 목소리가 커집니다!', '관중들이 박자를 맞춥니다. 둥둥둥!'
        ]), 'normal');
      } else if (!ball.carrier && chance(0.4)) {
        say('공이 공중에 뜹니다! 모두 머리를 향해 달려갑니다!', 'normal');
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
      possession: [homePoss, 100 - homePoss]
    };
    if (cfg.onEnd) { cfg.onEnd(res); }
  }

  /* ─────────────────────────  그리기  ───────────────────────── */
  function spriteOf(p, frame, face) {
    var key = p.player.id + '_' + (frame % 4) + '_' + (face > 0 ? 1 : 0) + '_' + p.kit.shirt;
    if (spriteCache[key]) { return spriteCache[key]; }
    var c = DS.Art.matchFig(p.player, p.kit, frame % 4, face);
    spriteCache[key] = c;
    return c;
  }

  function draw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, W, H);
    if (pitchLayer) { ctx.drawImage(pitchLayer, 0, 0, W, H); }
    else { DS.Art.drawPitch(ctx, W, H, { crowd: true }); }

    var scale = clamp(W / 192, 1.4, 2.1);
    var arr = players.slice().sort(function (a, b) { return a.y - b.y; });
    var i, p, px, py, sprite, offY;

    for (i = 0; i < arr.length; i++) {
      p = arr[i];
      px = sx(p.x); py = sy(p.y);
      offY = 0;
      if (p.dive > 0) { offY = -Math.sin(Math.min(1, p.dive) * Math.PI) * 6; }
      /* 그림자 */
      ctx.fillStyle = 'rgba(20,32,10,0.24)';
      ctx.beginPath();
      ctx.ellipse(px, py - 1, 7 * scale / 2, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      sprite = spriteOf(p, p.moving ? p.frame : 0, p.facing);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite,
        Math.round(px - sprite.width * scale / 2),
        Math.round(py - sprite.height * scale + 3 + offY),
        Math.round(sprite.width * scale), Math.round(sprite.height * scale));
      if (p.dive > 0) { p.dive = Math.max(0, p.dive - 0.02); }
      /* 공 보유 표시 */
      if (ball.carrier === p) {
        ctx.strokeStyle = 'rgba(255,240,150,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(px, py - 1, 8, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      /* 이름 */
      if (p.side === 'home') {
        ctx.font = 'bold 7px "DungGeunMo", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20,32,10,0.55)';
        ctx.fillRect(px - 11, py + 2, 22, 8);
        ctx.fillStyle = '#f6f2e2';
        ctx.fillText(short(p.name), px, py + 9);
      }
    }

    var bx = sx(ball.x), by = sy(ball.y);
    var ballY = by - Math.min(6, Math.abs(ball.vy) * 0.03) - 3;
    DS.Art.drawBall(ctx, bx, ballY, Math.max(3.2, W / 110));

    /* 시간 오버레이 */
    ctx.fillStyle = 'rgba(26,38,16,0.72)';
    ctx.fillRect(W - 54, H - 22, 48, 16);
    ctx.strokeStyle = 'rgba(240,225,190,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(W - 54.5, H - 22.5, 49, 17);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 10px "DungGeunMo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((minute() < 10 ? '0' : '') + minute() + "'", W - 30, H - 13);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (M.paused && M.running) {
      ctx.fillStyle = 'rgba(14,24,8,0.45)';
      ctx.fillRect(0, H / 2 - 18, W, 36);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 16px "DungGeunMo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HALF TIME', W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
    }
  }

  void looseBallPublic;
  void carrierOf;

  DS.Match = M;

})(window);
