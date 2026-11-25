/*! 도트싸커 × 포켓리그 v2 — 게임 상태 · 저장 · UI (game.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var fmt = U.fmt;
  var clamp = U.clamp;
  var chance = U.chance;
  var pick = U.pick;

  var SAVE_KEY = 'dot-soccer-v2-save';
  var MAX_SQUAD = 20;
  var BENCH_SIZE = 5;
  var CAND_COST = 2400;
  var REROLL_COST = 300;
  var S = null;
  var EXTRA = {};            /* 아직 스쿼드에 없는 선수(스카우트 후보) 조회용 */
  var currentTab = 'official';
  var selId = null;          /* 벤치 선택(교체) */
  var trainSel = { playerId: null, menus: [] };
  var rolePick = null;       /* 역할 지정 중인 키 */
  var ioState = { candId: null, outId: null };
  var subState = { inId: null, outId: null };
  var TOAST_T = null;

  /* ─────────────────────────  상태  ───────────────────────── */
  function makeTable() {
    var rows = [{ id: 'me', name: '도트 유나이티드', short: '도트', p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }];
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) {
      rows.push({ id: DS.TEAMS[i].id, name: DS.TEAMS[i].name, short: DS.TEAMS[i].short, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    }
    return rows;
  }

  function makeFixtures() {
    var ids = ['me'];
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { ids.push(DS.TEAMS[i].id); }
    var n = ids.length;
    var arr = ids.slice(1);
    var rounds = [];
    var r, j;
    for (r = 0; r < n - 1; r++) {
      var pairs = [];
      pairs.push([ids[0], arr[arr.length - 1]]);
      for (j = 0; j < (n - 2) / 2; j++) { pairs.push([arr[j], arr[n - 2 - j]]); }
      rounds.push(pairs);
      var last = arr.pop();
      arr.unshift(last);
    }
    return rounds;
  }

  function slotApt(slot) {
    var m = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' };
    return m[slot.pos] || 'CM';
  }

  function autoLineup(squad, formation) {
    var slots = DS.FORMATIONS[formation].slots;
    var used = {};
    var lineup = [];
    var i, k, best, bestScore, p, sc, apt;
    for (i = 0; i < slots.length; i++) {
      best = null; bestScore = -9999;
      for (k = 0; k < squad.length; k++) {
        p = squad[k];
        if (used[p.id]) { continue; }
        sc = DS.ratingOf(p);
        if (p.pos === slots[i].pos) { sc += 26; } else { sc -= 14; }
        apt = p.apt[slotApt(slots[i])] || 4;
        sc += apt * 1.6;
        if (slots[i].k) { sc += 1; }
        if (sc > bestScore) { bestScore = sc; best = p; }
      }
      if (best) { lineup.push(best.id); used[best.id] = true; } else { lineup.push(null); }
    }
    return lineup;
  }

  function autoBench(squad, lineup) {
    var inLine = {};
    var i;
    for (i = 0; i < lineup.length; i++) { if (lineup[i]) { inLine[lineup[i]] = true; } }
    var rest = squad.filter(function (p) { return !inLine[p.id]; });
    rest.sort(function (a, b) { return DS.ratingOf(b) - DS.ratingOf(a); });
    var bench = [];
    var need = ['GK', 'DF', 'MF', 'FW'];
    var j, p;
    for (j = 0; j < need.length && bench.length < BENCH_SIZE; j++) {
      for (i = 0; i < rest.length; i++) {
        p = rest[i];
        if (p.pos === need[j] && bench.indexOf(p.id) < 0) { bench.push(p.id); break; }
      }
    }
    for (i = 0; i < rest.length && bench.length < BENCH_SIZE; i++) {
      if (bench.indexOf(rest[i].id) < 0) { bench.push(rest[i].id); }
    }
    return bench;
  }

  function autoRoles() {
    var st = starters();
    if (!st.length) { return; }
    function best(fn) {
      var b = st[0], bv = -999, i, v;
      for (i = 0; i < st.length; i++) {
        v = fn(st[i]);
        if (v > bv) { bv = v; b = st[i]; }
      }
      return b.id;
    }
    if (!S.roles) { S.roles = {}; }
    S.roles = {
      cap: best(function (p) { return p.set.cap + (DS.traitOf(p.trait).mod.cap || 0) + p.tenure * 0.3; }),
      fk: best(function (p) { return p.set.fk + p.t * 0.4; }),
      ck: best(function (p) { return p.set.ck + p.t * 0.3; }),
      pk: best(function (p) { return p.set.pk + p.t * 0.4; })
    };
  }

  function defaultState() {
    DS.resetNames();
    var squad = DS.makeInitialSquad();
    var st = {
      v: 2,
      club: {
        name: '도트 유나이티드',
        emblem: 'flame',
        kit: { shirt: '#c8432f', shorts: '#f0e6cc', trim: '#ffe9a8' }
      },
      money: 6000,
      fans: 1280,
      morale: 66,
      condition: 84,
      season: 1,
      round: 0,
      seasonOver: false,
      formation: '4-3-3',
      tactics: 'balanced',
      squad: squad,
      lineup: [],
      bench: [],
      roles: {},
      facilities: { training: 0, medical: 0, shop: 0, fanclub: 0, cafe: 0 },
      sponsor: 'kimbap',
      combos: [],
      table: makeTable(),
      fixtures: makeFixtures(),
      career: [],
      challengeLeft: 1,
      smatchTickets: 3,
      smatchStreak: 0,
      totals: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 },
      lastResult: null,
      lastReport: null,
      scoutCandidates: [],
      dex: { players: {}, emblems: {}, kits: {} },
      log: []
    };
    st.lineup = autoLineup(squad, st.formation);
    st.bench = autoBench(squad, st.lineup);
    S = st;
    autoRoles();
    dexTouchAll();
    return st;
  }

  function dexTouchAll() {
    var i;
    for (i = 0; i < S.squad.length; i++) { S.dex.players[S.squad[i].name] = 1; }
    S.dex.emblems[S.club.emblem] = 1;
    S.dex.kits[S.club.kit.shirt] = 1;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { return null; }
      var d = JSON.parse(raw);
      if (!d || d.v !== 2 || !d.squad || !d.lineup || !d.club) { return null; }
      if (!d.table || !d.table.length) { d.table = makeTable(); }
      if (!d.fixtures || !d.fixtures.length) { d.fixtures = makeFixtures(); }
      if (!DS.FORMATIONS[d.formation]) { d.formation = '4-3-3'; }
      if (!d.bench) { d.bench = autoBench(d.squad, d.lineup); }
      if (!d.roles) { d.roles = {}; }
      if (!d.facilities) { d.facilities = { training: 0, medical: 0, shop: 0, fanclub: 0, cafe: 0 }; }
      if (!d.dex) { d.dex = { players: {}, emblems: {}, kits: {} }; }
      if (!d.totals) { d.totals = { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 }; }
      if (!d.career) { d.career = []; }
      if (!d.combos) { d.combos = []; }
      if (typeof d.smatchTickets !== 'number') { d.smatchTickets = 3; }
      if (typeof d.smatchStreak !== 'number') { d.smatchStreak = 0; }
      if (typeof d.condition !== 'number') { d.condition = 84; }
      if (typeof d.morale !== 'number') { d.morale = 66; }
      if (!d.sponsor) { d.sponsor = 'kimbap'; }
      if (!d.scoutCandidates) { d.scoutCandidates = []; }
      return d;
    } catch (e) { return null; }
  }

  /* ─────────────────────────  조회  ───────────────────────── */
  function byId(id) {
    var i;
    if (!id) { return null; }
    for (i = 0; i < S.squad.length; i++) { if (S.squad[i].id === id) { return S.squad[i]; } }
    return EXTRA[id] || null;
  }
  function findAny(id) { return byId(id); }

  function starters() {
    var out = [], i, p;
    for (i = 0; i < S.lineup.length; i++) {
      p = byId(S.lineup[i]);
      if (p) { out.push(p); }
    }
    return out;
  }
  function benchPlayers() {
    var out = [], i, p;
    for (i = 0; i < S.bench.length; i++) {
      p = byId(S.bench[i]);
      if (p && S.lineup.indexOf(p.id) < 0) { out.push(p); }
    }
    return out;
  }
  function backups() {
    var used = {};
    var i;
    for (i = 0; i < S.lineup.length; i++) { used[S.lineup[i]] = 1; }
    for (i = 0; i < S.bench.length; i++) { used[S.bench[i]] = 1; }
    return S.squad.filter(function (p) { return !used[p.id]; });
  }

  function teamPower() {
    var f = DS.FORMATIONS[S.formation];
    var sum = 0, n = 0, i, p, ov;
    for (i = 0; i < f.slots.length; i++) {
      p = byId(S.lineup[i]);
      if (!p) { continue; }
      ov = DS.ratingOf(p);
      if (p.pos === f.slots[i].pos) { ov += 2; } else { ov -= 6; }
      if (f.slots[i].k && p.pos === f.slots[i].pos) { ov += 3; }
      if (S.roles && (S.roles.cap === p.id || S.roles.fk === p.id || S.roles.ck === p.id || S.roles.pk === p.id)) { ov += 1; }
      sum += ov; n++;
    }
    var base = n ? sum / n : 40;
    return Math.round(base + (chemistry() - 55) / 10);
  }

  function chemistry() {
    var f = DS.FORMATIONS[S.formation];
    var matched = 0, near = 0, off = 0, missing = 0, i, p, slot;
    for (i = 0; i < f.slots.length; i++) {
      slot = f.slots[i];
      p = byId(S.lineup[i]);
      if (!p) { missing++; continue; }
      if (p.pos === slot.pos) { matched++; }
      else if (Math.abs(DS.POS_ORDER.indexOf(p.pos) - DS.POS_ORDER.indexOf(slot.pos)) === 1) { near++; }
      else { off++; }
    }
    var v = 48 + matched * 2.4 + near * 0.3 - off * 4.2 - missing * 6;
    return Math.round(clamp(v, 5, 99));
  }

  function traitSum() {
    var st = starters(), i, v = 0;
    for (i = 0; i < st.length; i++) { v += DS.traitOf(st[i].trait).val; }
    return v;
  }
  function leadSum() {
    var st = starters(), i, v = 0;
    for (i = 0; i < st.length; i++) { v += st[i].set.cap; }
    return v;
  }

  function opponentTeam(id) {
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].id === id) { return DS.TEAMS[i]; } }
    return DS.TEAMS[0];
  }
  function strengthOf(id) {
    if (id === 'me') { return teamPower(); }
    return opponentTeam(id).strength;
  }
  function sortTable() {
    S.table.sort(function (a, b) {
      if (b.pts !== a.pts) { return b.pts - a.pts; }
      var da = a.gf - a.ga, db = b.gf - b.ga;
      if (db !== da) { return db - da; }
      if (b.gf !== a.gf) { return b.gf - a.gf; }
      return a.name < b.name ? -1 : 1;
    });
  }
  function tableRow(id) {
    var i;
    for (i = 0; i < S.table.length; i++) { if (S.table[i].id === id) { return S.table[i]; } }
    return null;
  }
  function ourRank() {
    sortTable();
    var i;
    for (i = 0; i < S.table.length; i++) { if (S.table[i].id === 'me') { return i + 1; } }
    return 8;
  }
  function currentOpponent() {
    if (S.round >= S.fixtures.length) { return null; }
    var pairs = S.fixtures[S.round], i;
    for (i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === 'me') { return { id: pairs[i][1], home: true }; }
      if (pairs[i][1] === 'me') { return { id: pairs[i][0], home: false }; }
    }
    return null;
  }
  function simGoals(atk, def) {
    var exp = 1.35 * Math.pow(atk / Math.max(35, def), 1.9);
    exp = clamp(exp, 0.25, 4.2);
    var g = 0, i;
    for (i = 0; i < 7; i++) { if (Math.random() < exp / 7) { g++; } }
    return g;
  }
  function applyScore(id, gf, ga) {
    var row = tableRow(id);
    if (!row) { return; }
    row.p++; row.gf += gf; row.ga += ga;
    if (gf > ga) { row.w++; row.pts += 3; }
    else if (gf === ga) { row.d++; row.pts += 1; }
    else { row.l++; }
  }
  function playMatchRows(gf, ga, oppId) {
    var pairs = S.fixtures[S.round], i;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (a === 'me' || b === 'me') { continue; }
      var sa = strengthOf(a), sb = strengthOf(b);
      var ga1 = simGoals(sa, sb), gb1 = simGoals(sb, sa);
      applyScore(a, ga1, gb1);
      applyScore(b, gb1, ga1);
    }
    applyScore('me', gf, ga);
    applyScore(oppId, ga, gf);
    sortTable();
  }

  /* ─────────────────────────  공통 UI  ───────────────────────── */
  function toast(msg) {
    var box = document.getElementById('toast');
    if (!box) { return; }
    box.textContent = msg;
    box.classList.add('on');
    clearTimeout(TOAST_T);
    TOAST_T = setTimeout(function () { box.classList.remove('on'); }, 1900);
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function starsHTML(n, cls) {
    var s = '', i;
    for (i = 1; i <= 5; i++) { s += '<span class="' + (i <= n ? 'st on' : 'st') + '">★</span>'; }
    return s;
  }
  function rareStars(n) {
    var s = '', i;
    for (i = 0; i < n; i++) { s += '★'; }
    for (i = n; i < 5; i++) { s += '☆'; }
    return s;
  }
  function posColor(p) { return DS.POS[p.pos].color; }
  function rarityColor(p) { return DS.RARITY[p.rarity].color; }
  function rcls(p) { return 'r-' + p.rarity; }

  function headerHTML() {
    return '<div class="logo"><span class="logo-mark"></span><b>도트싸커</b><i>V2</i></div>' +
      '<div class="hchips">' +
      '<span class="hchip coin">🪙<b>' + fmt(S.money) + '</b></span>' +
      '<span class="hchip fan">👥<b>' + fmt(S.fans) + '</b></span>' +
      '</div>';
  }
  function renderHeader() {
    var h = document.getElementById('topbar');
    if (h) { h.innerHTML = headerHTML(); }
  }

  function figTag(p, cls, k, opt) {
    opt = opt || {};
    return '<canvas class="' + (cls || '') + '" data-fig="' + p.id + '" data-k="' + (k || 2) + '"' +
      (opt.number ? ' data-num="1"' : '') + (opt.captain ? ' data-cap="1"' : '') +
      (opt.gk ? ' data-gk="1"' : '') + '></canvas>';
  }

  function paintFigs(root) {
    var list = root.querySelectorAll('canvas[data-fig]');
    var i, c, p;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      p = findAny(c.getAttribute('data-fig'));
      if (!p) { continue; }
      DS.Art.paint(c, p, S.club.kit, {
        k: parseInt(c.getAttribute('data-k'), 10) || 2,
        number: c.getAttribute('data-num') ? p.number : 0,
        captain: !!c.getAttribute('data-cap'),
        gk: !!c.getAttribute('data-gk')
      });
    }
  }

  function paintEmblems(root) {
    var list = root.querySelectorAll('canvas[data-emblem]');
    var i, c, parts;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      parts = (c.getAttribute('data-kit') || '#c8432f|#ffe9a8').split('|');
      DS.Art.drawEmblem(c, c.getAttribute('data-emblem'), { shirt: parts[0], trim: parts[1] });
    }
  }

  function paintFacilities(root) {
    var list = root.querySelectorAll('canvas[data-fac]');
    var i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      DS.Art.paintFacility(c, c.getAttribute('data-fac'), parseInt(c.getAttribute('data-lv'), 10) || 0);
    }
  }

  function paintStaff(root) {
    var list = root.querySelectorAll('canvas[data-staff]');
    var i;
    for (i = 0; i < list.length; i++) {
      DS.Art.paintStaff(list[i], list[i].getAttribute('data-staff'));
    }
  }

  function paintAll(root) {
    paintFigs(root); paintEmblems(root); paintFacilities(root); paintStaff(root);
    var t = root.querySelector('canvas[data-tend]');
    if (t) {
      var p = findAny(t.getAttribute('data-tend'));
      if (p) { drawTend(t, p.tend); }
    }
  }

  /* 개성 차트 (지성 / 조직 / 감성 / 개인) */
  function drawTend(cv, tend) {
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 + 1, R = Math.min(W, H) * 0.31;
    var axes = [
      { v: tend.int, dx: 0, dy: -1 },
      { v: tend.org, dx: 1, dy: 0 },
      { v: tend.emo, dx: 0, dy: 1 },
      { v: tend.ind, dx: -1, dy: 0 }
    ];
    var k, i, p;
    g.strokeStyle = 'rgba(120,95,55,.35)';
    g.lineWidth = 0.8;
    for (k = 1; k <= 2; k++) {
      g.beginPath();
      for (i = 0; i < 4; i++) {
        p = axes[i];
        var x = cx + p.dx * R * k / 2, y = cy + p.dy * R * k / 2;
        if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
      }
      g.closePath(); g.stroke();
    }
    g.beginPath();
    g.moveTo(cx, cy - R); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R, cy);
    g.closePath(); g.stroke();
    g.beginPath();
    for (i = 0; i < 4; i++) {
      p = axes[i];
      var r = R * clamp(p.v, 1, 10) / 10;
      var px = cx + p.dx * r, py = cy + p.dy * r;
      if (i === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); }
    }
    g.closePath();
    g.fillStyle = 'rgba(224,138,44,.55)';
    g.fill();
    g.strokeStyle = '#b8621a';
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = '#7a6440';
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    g.fillText('지성', cx, cy - R - 2);
    g.fillText('감성', cx, cy + R + 8);
    g.textAlign = 'left';
    g.fillText('조직', cx + R + 1, cy + 3);
    g.textAlign = 'right';
    g.fillText('개인', cx - R - 1, cy + 3);
  }

  /* ─────────────────────────  공식전  ───────────────────────── */
  function nextLabel() {
    var t = ['19:30', '20:00', '21:00'];
    return t[S.round % 3];
  }

  function powerStars(v) {
    if (v >= 88) { return 5; }
    if (v >= 78) { return 4; }
    if (v >= 66) { return 3; }
    if (v >= 54) { return 2; }
    return 1;
  }

  function renderOfficial() {
    var box = document.getElementById('screen-official');
    if (!box) { return; }
    var power = teamPower();
    var chem = chemistry();
    var rank = ourRank();
    var rows = '', i, r, isMe;

    sortTable();
    for (i = 0; i < S.table.length; i++) {
      r = S.table[i];
      isMe = r.id === 'me';
      rows += '<tr class="' + (isMe ? 'me' : '') + '">' +
        '<td class="rk">' + (i + 1) + '</td>' +
        '<td class="tm">' + esc(isMe ? S.club.name : r.name) + '</td>' +
        '<td class="num">' + r.p + '</td>' +
        '<td class="num">' + (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) + '</td>' +
        '<td class="num pts">' + r.pts + '</td>' +
        '</tr>';
    }

    var next = currentOpponent();
    var nextHTML = '';
    if (S.seasonOver) {
      var w = S.table[0];
      nextHTML = '<div class="card">' +
        '<div class="card-title">🏆 시즌 ' + S.season + ' 종료 <span class="muted">FINAL</span></div>' +
        '<div class="b" style="font-size:12.5px">우승: ' + esc(w.id === 'me' ? S.club.name : w.name) + '</div>' +
        '<div class="muted" style="margin:2px 0 6px">우리 구단 최종 <b>' + ourRank() + '위</b> · 승점 ' + tableRow('me').pts + '</div>' +
        '<button class="btn primary wide" data-act="newseason">새 시즌 시작</button>' +
        '</div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      nextHTML = '<div class="card">' +
        '<div class="card-title">📅 ' + (S.round + 1) + '라운드 공식전 <span class="muted">' + (next.home ? '홈' : '원정') + ' · ' + nextLabel() + '</span></div>' +
        '<div class="vsrow">' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="48" height="54"></canvas><span>' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>전력 ' + opp.strength + '</span></div>' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="48" height="54"></canvas><span>' + esc(opp.name) + '</span></div>' +
        '</div>' +
        '<button class="btn primary wide" data-act="kickoff">공식전 킥오프</button>' +
        '</div>';
    }

    var lastHTML = '';
    if (S.lastResult && S.lastReport) {
      var lr = S.lastResult;
      lastHTML = '<div class="card">' +
        '<div class="card-title">📋 최근 경기 <span class="muted">' + esc(lr.awayName) + '</span></div>' +
        '<div class="lr-row"><span>' + esc(lr.homeName) + '</span><b class="lr-score">' + lr.gf + ' : ' + lr.ga + '</b></div>' +
        '<div class="muted tiny" style="margin-top:2px">MVP ' + esc(lr.mvp) + ' · 평점 ' + lr.mvpRating.toFixed(1) + ' · 보상 🪙' + fmt(lr.reward) + '</div>' +
        '<button class="btn ghost sm" style="width:100%;margin-top:5px" data-act="report">상세 결과서 보기</button>' +
        '</div>';
    }

    box.innerHTML =
      '<div class="card club-card">' +
      '<canvas class="club-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="60" height="68"></canvas>' +
      '<div class="club-main">' +
      '<div class="club-name">' + esc(S.club.name) + '</div>' +
      '<div class="club-stars">' + starsHTML(powerStars(power)) + '<span class="power">전력 ' + power + '</span></div>' +
      '<div class="club-sub">리그 ' + rank + '위 · 조직력 ' + chem + ' · 사기 ' + S.morale + ' · 컨디션 ' + S.condition + '</div>' +
      '</div>' +
      '<button class="btn ghost sm" data-act="tab" data-tab="myteam">마이팀</button>' +
      '</div>' +
      nextHTML +
      '<div class="card">' +
      '<div class="card-title">🏆 리그 순위표 <span class="muted">8팀 · 7라운드</span></div>' +
      '<table class="ltable"><thead><tr><th>#</th><th>구단</th><th>경기</th><th>득실</th><th>승점</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
      lastHTML +
      '<div class="card">' +
      '<div class="card-title">📊 시즌 기록 <span class="muted">승률 ' + (S.totals.matches ? Math.round(S.totals.wins / S.totals.matches * 100) : 0) + '%</span></div>' +
      '<div class="statgrid">' +
      '<div><b>' + S.totals.matches + '</b><span>경기</span></div>' +
      '<div><b class="w">' + S.totals.wins + '</b><span>승</span></div>' +
      '<div><b>' + S.totals.draws + '</b><span>무</span></div>' +
      '<div><b class="l">' + S.totals.losses + '</b><span>패</span></div>' +
      '<div><b>' + S.totals.goals + '</b><span>득점</span></div>' +
      '<div><b>' + S.totals.conceded + '</b><span>실점</span></div>' +
      '</div>' +
      '<div class="morale-row"><span>팀 사기</span><div class="morale"><i style="width:' + S.morale + '%"></i></div><b>' + S.morale + '</b></div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">⚔️ 챌린지 매치 <span class="muted">보상 2배</span></div>' +
      '<div class="row-between"><span class="muted">최강 구단과 붙어 보상 2배. 오늘 ' + S.challengeLeft + '회 남음.</span>' +
      '<button class="btn sm" data-act="challenge" ' + (S.challengeLeft <= 0 ? 'disabled' : '') + '>도전</button></div>' +
      '</div>';

    paintAll(box);
  }

  /* ─────────────────────────  S매치  ───────────────────────── */
  function smatchList() {
    var pool = DS.TEAMS.slice().sort(function (a, b) { return a.strength - b.strength; });
    return [
      { key: 's1', name: 'S1 · 연습 경기', team: pool[0], reward: 420, desc: '가볍게 몸을 푸는 매치', stars: 1 },
      { key: 's2', name: 'S2 · 친선 경기', team: pool[Math.floor(pool.length / 2)], reward: 760, desc: '중위권과의 진검승부', stars: 2 },
      { key: 's3', name: 'S3 · 숙적전', team: pool[pool.length - 1], reward: 1320, desc: '최강 구단과의 자존심 대결', stars: 3 }
    ];
  }

  function renderSmatch() {
    var box = document.getElementById('screen-smatch');
    if (!box) { return; }
    var list = smatchList(), i, it, opp;
    var cards = '';
    for (i = 0; i < list.length; i++) {
      it = list[i];
      opp = it.team;
      cards += '<div class="card">' +
        '<div class="card-title">' + it.name + ' <span class="muted">' + starsHTML(it.stars) + '</span></div>' +
        '<div class="vsrow" style="margin-bottom:4px">' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="42" height="48"></canvas><span>' + esc(S.club.short || S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>전력 ' + opp.strength + '</span></div>' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="42" height="48"></canvas><span>' + esc(opp.short) + '</span></div>' +
        '</div>' +
        '<div class="muted tiny" style="margin-bottom:4px">' + it.desc + ' · 보상 🪙' + fmt(it.reward) + (S.smatchStreak >= 3 ? ' (+연승 보너스)' : '') + '</div>' +
        '<button class="btn wide' + (i === 2 ? ' red' : '') + '" data-act="smatch" data-k="' + it.key + '" ' + (S.smatchTickets <= 0 ? 'disabled' : '') + '>S매치 시작 <span style="font-size:9.5px;opacity:.85">🎟 ' + S.smatchTickets + '</span></button>' +
        '</div>';
    }

    box.innerHTML =
      '<div class="card">' +
      '<div class="card-title">🎟️ S매치 <span class="muted">스페셜 매치</span></div>' +
      '<div class="row-between">' +
      '<div class="muted">리그와 별개로 치르는 특별 경기. 승리하면 팬과 금화를 크게 얻습니다.</div>' +
      '</div>' +
      '<div class="statgrid" style="margin-top:5px">' +
      '<div><b>' + S.smatchTickets + '</b><span>이용권</span></div>' +
      '<div><b>' + S.smatchStreak + '</b><span>연승</span></div>' +
      '<div><b>' + (S.smatchStreak >= 3 ? '+25%' : '—') + '</b><span>보너스</span></div>' +
      '<div><b>' + S.totals.matches + '</b><span>총 경기</span></div>' +
      '<div><b>' + (S.totals.matches ? Math.round(S.totals.wins / S.totals.matches * 100) : 0) + '%</b><span>승률</span></div>' +
      '<div><b>' + S.totals.goals + '</b><span>득점</span></div>' +
      '</div>' +
      '<button class="btn navy sm" style="width:100%;margin-top:3px" data-act="smatchticket">이용권 충전 🪙800</button>' +
      '</div>' +
      cards +
      '<div class="card">' +
      '<div class="card-title">📖 S매치 안내</div>' +
      '<div class="muted tiny" style="line-height:1.6">· 이용권은 시즌마다 3장 지급됩니다.<br>· 실시간 경기로 진행되며 하프타임에 선수 교체가 가능합니다.<br>· 3연승부터 보상이 25% 늘어납니다.</div>' +
      '</div>';

    paintAll(box);
  }

  /* ─────────────────────────  마이팀  ───────────────────────── */
  var pitchBox = { x: 0, y: 0, w: 350, h: 320 };

  function renderMyteam() {
    var box = document.getElementById('screen-myteam');
    if (!box) { return; }
    var f = DS.FORMATIONS[S.formation];
    var i, slot, p, chips = '', playersHTML = '';

    for (i = 0; i < DS.FORMATION_KEYS.length; i++) {
      chips += '<button class="fchip ' + (S.formation === DS.FORMATION_KEYS[i] ? 'on' : '') + '" data-act="formation" data-f="' + DS.FORMATION_KEYS[i] + '">' + DS.FORMATION_KEYS[i] + '</button>';
    }

    for (i = 0; i < f.slots.length; i++) {
      slot = f.slots[i];
      p = byId(S.lineup[i]);
      var badges = '';
      if (p) {
        badges += '<span class="rbadges">';
        if (S.roles.cap === p.id) { badges += '<span class="rolebadge">CAP</span>'; }
        if (S.roles.fk === p.id) { badges += '<span class="rolebadge fk">FK</span>'; }
        if (S.roles.ck === p.id) { badges += '<span class="rolebadge ck">CK</span>'; }
        if (S.roles.pk === p.id) { badges += '<span class="rolebadge pk">PK</span>'; }
        badges += '</span>';
      }
      playersHTML += '<button class="pdot ' + (p ? rcls(p) : 'empty') + (selId === (p && p.id) ? ' sel' : '') + '" ' +
        'data-x="' + slot.x + '" data-y="' + slot.y + '" data-act="starter" data-slot="' + i + '" data-id="' + (p ? p.id : '') + '">' +
        (slot.k ? '<span class="keystar">☆</span>' : '') + badges +
        (p ? figTag(p, 'pcanvas', 2, { number: false }) : '') +
        '<span class="plabel"><i>' + slot.role + '</i>' + esc(p ? shortName(p.name) : '공석') + '</span>' +
        '</button>';
    }

    var bench = benchPlayers();
    var benchHTML = '';
    for (i = 0; i < BENCH_SIZE; i++) {
      var b = bench[i];
      if (b) {
        benchHTML += '<button class="bcard ' + (selId === b.id ? 'sel' : '') + '" data-act="bench" data-id="' + b.id + '">' +
          '<span class="posline" style="--pc:' + posColor(b) + '"></span>' +
          figTag(b, 'pcanvas', 2) +
          '<span class="bn">' + esc(shortName(b.name)) + '</span>' +
          '<span class="br" style="--rc:' + rarityColor(b) + '">' + DS.RARITY[b.rarity].name + ' ' + DS.ratingOf(b) + '</span>' +
          '<span class="mbars"><i class="s" style="width:' + (b.s * 10) + '%"></i></span>' +
          '<span class="mbars"><i class="t" style="width:' + (b.t * 10) + '%"></i></span>' +
          '<span class="mbars"><i class="p" style="width:' + (b.p * 10) + '%"></i></span>' +
          '</button>';
      } else {
        benchHTML += '<div class="bcard empty">벤치<br>공석</div>';
      }
    }

    var bk = backups();
    var bkHTML = '';
    for (i = 0; i < bk.length; i++) {
      bkHTML += '<button class="bk-item" data-act="backup" data-id="' + bk[i].id + '">' +
        '<i style="--pc:' + posColor(bk[i]) + '">' + bk[i].pos + '</i>' + figTag(bk[i], 'pcanvas', 2) + esc(shortName(bk[i].name)) + '</button>';
    }
    if (!bk.length) { bkHTML = '<span class="muted tiny" style="color:#d8d0b8">백업 없음</span>'; }

    box.innerHTML =
      '<div class="mt-top">' +
      '<div class="fchips">' + chips + '</div>' +
      '<div class="mt-meta"><span class="pill2">개성 <b>' + traitSum() + '</b></span><span class="pill2">통솔 <b>' + leadSum() + '</b></span></div>' +
      '</div>' +
      '<div class="pitch" id="pitch-squad">' +
      '<canvas id="pitch-bg" class="pitch-bg"></canvas>' +
      '<div class="pitch-tag">' + S.formation + ' · ' + f.desc + '<br>☆ = 핵심 자리 (+3)</div>' +
      playersHTML +
      '</div>' +
      '<div class="bench">' +
      '<div class="bench-head"><span>벤치 멤버 ' + bench.length + '/' + BENCH_SIZE + '</span><span>탭 후 피치 선수를 탭 = 교체</span></div>' +
      '<div class="bench-list">' + benchHTML + '</div>' +
      '</div>' +
      '<div class="bk-row"><span class="bk-title">백업</span><div class="bk-list">' + bkHTML + '</div></div>' +
      '<div class="mt-actions">' +
      '<button class="btn" data-act="roleassign">역할 지정</button>' +
      '<button class="btn navy" data-act="autolineup">자동 배치</button>' +
      '<button class="btn ghost" data-act="tab" data-tab="shop">도감</button>' +
      '</div>';

    drawPitchBG();
    placePitchPlayers();
    paintAll(box);
  }

  function shortName(n) {
    if (!n) { return ''; }
    if (n.length <= 3) { return n; }
    return n.slice(1);
  }

  function drawPitchBG() {
    var cv = document.getElementById('pitch-bg');
    if (!cv) { return; }
    var wrap = cv.parentNode;
    var w = wrap.clientWidth || 350;
    var h = wrap.clientHeight || 320;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    var m = DS.Art.pitchMargin(w, h);
    pitchBox = { x: m, y: m, w: w - m * 2, h: h - m * 2 };
    DS.Art.drawPitch(g, w, h, { margin: m, crowd: false });
  }

  function placePitchPlayers() {
    var dots = document.querySelectorAll('#pitch-squad .pdot');
    var i, x, y, px, py;
    for (i = 0; i < dots.length; i++) {
      x = parseFloat(dots[i].getAttribute('data-x'));
      y = parseFloat(dots[i].getAttribute('data-y'));
      if (isNaN(x) || isNaN(y)) { continue; }
      px = pitchBox.x + (x / 100) * pitchBox.w;
      py = pitchBox.y + (y / 100) * pitchBox.h;
      dots[i].style.left = px.toFixed(1) + 'px';
      dots[i].style.top = py.toFixed(1) + 'px';
    }
  }

  /* ─────────────────────────  클럽경영  ───────────────────────── */
  function facEffect(fac, lv) {
    return fac.effect(lv);
  }
  function facValue(key) {
    var fac = DS.facilityOf(key);
    return fac ? facEffect(fac, S.facilities[key] || 0) : 0;
  }

  function renderClub() {
    var box = document.getElementById('screen-club');
    if (!box) { return; }
    var i, fac, lv, cost, facHTML = '';
    for (i = 0; i < DS.FACILITIES.length; i++) {
      fac = DS.FACILITIES[i];
      lv = S.facilities[fac.key] || 0;
      cost = DS.facilityCost(fac, lv);
      facHTML += '<div class="fac' + (lv > 0 ? ' built' : '') + '">' +
        '<div class="fac-top">' +
        '<canvas data-fac="' + fac.icon + '" data-lv="' + lv + '"></canvas>' +
        '<div style="min-width:0"><div class="fac-name">' + fac.name + '</div><div class="fac-lv">Lv.' + lv + ' / 5</div></div>' +
        '</div>' +
        '<div class="fac-eff"><span>' + fac.target + '</span><b>' + (lv > 0 ? '+' + facEffect(fac, lv) + fac.unit : '—') + '</b></div>' +
        '<button class="btn sm' + (lv === 0 ? ' primary' : '') + '" data-act="facility" data-k="' + fac.key + '" ' + (lv >= 5 ? 'disabled' : (S.money < cost ? 'disabled' : '')) + '>' +
        (lv >= 5 ? 'MAX' : (lv === 0 ? '건설 ' : '업그레이드 ') + '🪙' + fmt(cost)) + '</button>' +
        '</div>';
    }

    /* 특훈 콤보 */
    var tp = trainSel.playerId ? byId(trainSel.playerId) : starters()[0];
    if (!tp) { tp = starters()[0] || null; trainSel.playerId = tp ? tp.id : null; }
    if (tp && !trainSel.playerId) { trainSel.playerId = tp.id; }
    var menuHTML = '', m, on;
    for (i = 0; i < DS.TRAIN_MENUS.length; i++) {
      m = DS.TRAIN_MENUS[i];
      on = trainSel.menus.indexOf(m.key) >= 0;
      menuHTML += '<button class="' + (on ? 'on' : '') + '" data-act="trainmenu" data-k="' + m.key + '">' +
        '<span>' + m.icon + '</span><span>' + m.name + '</span><em>' + m.desc + '</em></button>';
    }
    var combo = trainSel.menus.length === 2 ? DS.findCombo(trainSel.menus[0], trainSel.menus[1]) : null;
    var slots = '';
    for (i = 0; i < 2; i++) {
      var mk = trainSel.menus[i];
      var mm = mk ? DS.trainMenuOf(mk) : null;
      slots += '<div class="train-slot ' + (mm ? 'filled' : '') + '">' + (mm ? '<b>' + mm.icon + ' ' + mm.name + '</b><span class="x">' + mm.desc + '</span>' : '훈련 ' + (i + 1)) + '</div>';
    }
    var comboList = '', c, unlocked;
    for (i = 0; i < DS.COMBOS.length; i++) {
      c = DS.COMBOS[i];
      var a = DS.trainMenuOf(c.pair[0]).name, b = DS.trainMenuOf(c.pair[1]).name;
      unlocked = S.combos.indexOf(c.skill) >= 0;
      comboList += '<div class="combo-row' + (combo === c ? ' on' : '') + '">' +
        '<b>' + c.name + '</b><span>' + a + ' + ' + b + ' · ' + c.desc + (unlocked ? ' ✓' : '') + '</span></div>';
    }
    var trainCost = tp ? (300 + tp.level * 120) : 0;

    /* 스폰서 */
    var spHTML = '', sp, unlockedSp, active;
    for (i = 0; i < DS.SPONSORS.length; i++) {
      sp = DS.SPONSORS[i];
      unlockedSp = S.fans >= sp.fans;
      active = S.sponsor === sp.id;
      spHTML += '<div class="sponsor-row' + (unlockedSp ? '' : ' locked') + (active ? ' active' : '') + '">' +
        '<span class="sp-ico">' + (sp.id === 'kimbap' ? '🍙' : (sp.id === 'stationery' ? '✏️' : (sp.id === 'electronics' ? '📺' : (sp.id === 'laundry' ? '🧺' : (sp.id === 'hotel' ? '🏨' : '⚡'))))) + '</span>' +
        '<div class="sp-main"><b>' + sp.name + '</b><div class="muted tiny">경기당 🪙' + fmt(sp.bonus) + ' · ' + sp.desc + '</div></div>' +
        (active ? '<span class="chip on">계약중</span>' :
          (unlockedSp ? '<button class="btn sm" data-act="sponsor" data-id="' + sp.id + '">계약</button>' :
            '<span class="muted tiny">팬 ' + fmt(sp.fans) + ' 필요</span>')) +
        '</div>';
    }

    var swatches = '', swatches2 = '', e, emb = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      swatches += '<button class="swatch' + (S.club.kit.shirt === DS.KIT_COLORS[i] ? ' on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="kit" data-c="' + DS.KIT_COLORS[i] + '"></button>';
      swatches2 += '<button class="swatch' + (S.club.kit.shorts === DS.KIT_COLORS[i] ? ' on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="shorts" data-c="' + DS.KIT_COLORS[i] + '"></button>';
    }
    for (i = 0; i < DS.EMBLEMS.length; i++) {
      e = DS.EMBLEMS[i];
      emb += '<button class="embpick' + (S.club.emblem === e.id ? ' on' : '') + '" data-act="emblem" data-e="' + e.id + '">' +
        '<canvas width="30" height="34" data-emblem="' + e.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '"></canvas></button>';
    }

    box.innerHTML =
      '<div class="card staff-card">' +
      '<canvas data-staff="scout"></canvas>' +
      '<div class="speech">' +
      '<b>스카우터 안내원</b> — 구단 시설을 세우면 훈련·수입·체력이 함께 자라요. 아래에서 시설을 고르고, 특훈 콤보로 선수를 키워 보세요!' +
      '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🏗️ 구단 시설 <span class="muted">팬 ' + fmt(S.fans) + ' · 시설 합 ' + (S.facilities.training + S.facilities.medical + S.facilities.shop + S.facilities.fanclub + S.facilities.cafe) + '</span></div>' +
      '<div class="fac-grid">' + facHTML + '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🔥 특훈 콤보 <span class="muted">훈련 2개 조합</span></div>' +
      '<div class="row-between" style="margin-bottom:4px">' +
      '<span class="muted tiny">대상 선수</span>' +
      '<select id="train-player" class="pick">' + playerOptions(tp ? tp.id : '') + '</select>' +
      '</div>' +
      '<div class="train-slots">' + slots + '</div>' +
      '<div class="train-menu">' + menuHTML + '</div>' +
      (combo ? '<div class="fac-eff" style="margin:4px 0 2px"><span>특훈 콤보</span><b>' + combo.name + ' · ' + combo.desc + '</b></div>' : '') +
      '<button class="btn primary wide" style="margin-top:5px" data-act="trainrun" ' + (trainSel.menus.length !== 2 || !tp || S.money < trainCost ? 'disabled' : '') + '>' +
      '특훈 실행 🪙' + fmt(trainCost) + '</button>' +
      '<div class="band" style="margin:6px -8px 4px">콤보 도감</div>' +
      '<div class="combo-list">' + comboList + '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🤝 스폰서 <span class="muted">경기당 보너스</span></div>' + spHTML +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🎨 구단 꾸미기</div>' +
      '<label class="field2"><span>구단명</span><input id="club-name-input" maxlength="12" value="' + esc(S.club.name) + '"><button class="btn sm" data-act="rename">저장</button></label>' +
      '<div class="kit-row"><canvas id="kit-preview" width="60" height="66"></canvas>' +
      '<div style="flex:1 1 auto;min-width:0"><div class="sw-line">유니폼' + swatches + '</div><div class="sw-line">반바지' + swatches2 + '</div></div></div>' +
      '<div class="emb-row">' + emb + '</div>' +
      '</div>' +
      '<div class="card"><div class="row-between"><button class="btn ghost sm" data-act="reset">게임 초기화</button>' +
      '<span class="muted tiny">저장 데이터가 삭제됩니다</span></div></div>';

    paintAll(box);
    var kitCv = document.getElementById('kit-preview');
    if (kitCv) { DS.Art.drawKit(kitCv, S.club.kit, starters()[0]); }
  }

  function playerOptions(sel) {
    var list = S.squad.slice().sort(function (a, b) { return DS.ratingOf(b) - DS.ratingOf(a); });
    var s = '', i;
    for (i = 0; i < list.length; i++) {
      s += '<option value="' + list[i].id + '"' + (list[i].id === sel ? ' selected' : '') + '>' + esc(list[i].name) + ' · ' + list[i].pos + ' ' + DS.ratingOf(list[i]) + '</option>';
    }
    return s;
  }

  /* ─────────────────────────  상점  ───────────────────────── */
  function rollScout() {
    S.scoutCandidates = [];
    var i;
    for (i = 0; i < 4; i++) {
      var p = DS.makePlayer({ rarity: DS.pickRarity('special') });
      S.scoutCandidates.push(p);
      EXTRA[p.id] = p;
    }
  }

  function renderShop() {
    var box = document.getElementById('screen-shop');
    if (!box) { return; }
    if (!S.scoutCandidates || !S.scoutCandidates.length) { rollScout(); }

    var i, p, cards = '';
    for (i = 0; i < S.scoutCandidates.length; i++) {
      p = S.scoutCandidates[i];
      EXTRA[p.id] = p;
      cards += '<button class="sc-card" data-act="scoutpick" data-id="' + p.id + '">' +
        '<span class="sc-port"><canvas data-fig="' + p.id + '" data-k="2"></canvas>' +
        '<span class="sc-pos" style="--pc:' + posColor(p) + '">' + p.pos + '</span></span>' +
        '<span class="sc-main">' +
        '<span class="sc-name">' + esc(p.name) + '</span>' +
        '<span class="sc-meta"><b>' + p.tenure + '기수</b><span>Rt.' + DS.ratingOf(p) + '</span><span>개성 ' + DS.traitOf(p.trait).val + '</span></span>' +
        '<span class="sc-rare" style="--rc:' + rarityColor(p) + '">Rare <i>' + rareStars(DS.RARITY[p.rarity].stars) + '</i></span>' +
        '</span>' +
        '<span class="sc-gauges">' +
        '<span class="vg s"><i style="height:' + (p.s * 10) + '%"></i></span>' +
        '<span class="vg t"><i style="height:' + (p.t * 10) + '%"></i></span>' +
        '<span class="vg p"><i style="height:' + (p.p * 10) + '%"></i></span>' +
        '<span class="nums"><span>' + p.s + '</span><span>' + p.t + '</span><span>' + p.p + '</span></span>' +
        '</span>' +
        '</button>';
    }

    var dex = S.dex;
    var dexP = Object.keys(dex.players).length, dexE = Object.keys(dex.emblems).length, dexK = Object.keys(dex.kits).length;
    var targets = { p: 40, e: DS.EMBLEMS.length, k: DS.KIT_COLORS.length };
    var pctP = Math.min(100, Math.round(dexP / targets.p * 100));
    var pctE = Math.round(dexE / targets.e * 100);
    var pctK = Math.round(dexK / targets.k * 100);

    var eCells = '', em;
    for (i = 0; i < DS.EMBLEMS.length; i++) {
      em = DS.EMBLEMS[i];
      var got = !!dex.emblems[em.id];
      eCells += '<div class="dex-cell' + (got ? ' got' : '') + '">' +
        (got ? '<canvas width="30" height="34" data-emblem="' + em.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '"></canvas>' : '<span style="font-size:16px">？</span>') +
        '<span>' + (got ? em.name : '???') + '</span></div>';
    }
    var kCells = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      var kc = DS.KIT_COLORS[i];
      var kg = !!dex.kits[kc];
      kCells += '<div class="dex-cell' + (kg ? ' got' : '') + '"><span style="display:block;width:22px;height:22px;border-radius:3px;border:1px solid rgba(60,40,10,.4);background:' + (kg ? kc : '#cdbb96') + '"></span><span>' + (kg ? '유니폼 ' + (i + 1) : '???') + '</span></div>';
    }

    box.innerHTML =
      '<div class="shop-banner"><span>🛒</span><div><b>상점 SHOP</b><div><span>스페셜 스카우터 · 도감 · 아이템</span></div></div></div>' +
      '<div class="card staff-card">' +
      '<canvas data-staff="scout"></canvas>' +
      '<div class="speech">스페셜 스카우터에서 <b>리스트 갱신 완료</b>! 영입하고 싶은 선수를 선택해 주세요.<br>방출할 선수를 고르면 바로 교환이 진행됩니다.</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🔭 스페셜 스카우트 <span class="muted">4인 후보</span></div>' +
      '<div class="sc-head"><span>POSITION <b>RANDOM</b></span><span>영입 비용 🪙' + fmt(CAND_COST) + '</span></div>' +
      '<div class="sc-list">' + cards + '</div>' +
      '<div class="row-between" style="margin-top:6px">' +
      '<button class="btn red sm" data-act="reroll" ' + (S.money < REROLL_COST ? 'disabled' : '') + '>동일 조건 갱신 🪙' + fmt(REROLL_COST) + '</button>' +
      '<button class="btn sm" data-act="normalScout" ' + (S.money < 600 ? 'disabled' : '') + '>일반 스카우트 🪙600</button>' +
      '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">📚 컬렉션 도감 <span class="muted">수집률</span></div>' +
      '<div class="row-between"><span class="muted tiny">선수 ' + dexP + '/' + targets.p + '</span><b style="font-size:10px">' + pctP + '%</b></div>' +
      '<div class="dex-bar"><i style="width:' + pctP + '%"></i></div>' +
      '<div class="row-between"><span class="muted tiny">엠블럼 ' + dexE + '/' + targets.e + '</span><b style="font-size:10px">' + pctE + '%</b></div>' +
      '<div class="dex-bar"><i style="width:' + pctE + '%"></i></div>' +
      '<div class="dex-grid" style="margin-top:4px">' + eCells + '</div>' +
      '<div class="row-between" style="margin-top:6px"><span class="muted tiny">유니폼 ' + dexK + '/' + targets.k + '</span><b style="font-size:10px">' + pctK + '%</b></div>' +
      '<div class="dex-bar"><i style="width:' + pctK + '%"></i></div>' +
      '<div class="dex-grid">' + kCells + '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🧃 아이템</div>' +
      '<div class="row-between" style="margin-bottom:4px"><span class="muted">컨디션 드링크 · 컨디션 +20</span><button class="btn sm" data-act="item" data-k="drink" ' + (S.money < 600 ? 'disabled' : '') + '>🪙600</button></div>' +
      '<div class="row-between"><span class="muted">응원단 파티 · 사기 +12</span><button class="btn sm" data-act="item" data-k="party" ' + (S.money < 900 ? 'disabled' : '') + '>🪙900</button></div>' +
      '</div>';

    paintAll(box);
  }

  /* ═════════════════════════  모달  ═════════════════════════ */
  function openModal(cls) {
    var m = document.getElementById('modal');
    if (!m) { return; }
    m.className = 'on' + (cls ? ' ' + cls : '');
    m.scrollTop = 0;
  }
  function closeModal() {
    var m = document.getElementById('modal');
    if (!m) { return; }
    var wasReport = m.className.indexOf('report') >= 0;
    m.className = '';
    m.innerHTML = '';
    rolePick = null;
    ioState = { candId: null, outId: null };
    if (wasReport) { setTab('official'); }
  }
  function isModalOpen() {
    var m = document.getElementById('modal');
    return !!(m && m.className.indexOf('on') >= 0);
  }
  function setSheet(title, body, cls) {
    var m = document.getElementById('modal');
    m.className = 'on' + (cls ? ' ' + cls : '');
    m.innerHTML = '<div class="sheet">' +
      '<div class="sheet-head"><b>' + title + '</b><button class="x" data-act="closemodal">닫기 ✕</button></div>' +
      '<div class="sheet-body">' + body + '</div></div>';
    m.scrollTop = 0;
  }

  /* ───────── 선수 상세 (PLAYER DETAIL) ───────── */
  function aptCells(p) {
    var html = '', r, c, code, v, cls;
    for (r = 0; r < DS.APT_GRID.length; r++) {
      for (c = 0; c < DS.APT_GRID[r].length; c++) {
        code = DS.APT_GRID[r][c];
        v = p.apt[code] || 1;
        cls = r === 0 ? 'top' : (r === 1 ? 'mid' : (r === 2 ? 'back' : 'gk'));
        html += '<div class="apt-cell ' + cls + (DS.APT_GRID[r].length === 1 ? ' wide' : '') + '" ' +
          'style="box-shadow:inset 0 0 0 100px rgba(0,0,0,' + ((9 - v) / 9 * 0.36).toFixed(2) + ')">' +
          '<span>' + v + '</span><small>' + code + '</small></div>';
      }
    }
    return html;
  }

  function statRow(label, v, cls) {
    return '<div class="st-row"><span class="lb">' + label + '</span>' +
      '<span class="gauge ' + cls + '"><i style="width:' + (clamp(v, 0, 10) * 10) + '%"></i></span>' +
      '<span class="num">' + v + '</span></div>';
  }

  function playerModal(p) {
    var inSquad = S.squad.indexOf(p) >= 0;
    var tr = DS.traitOf(p.trait);
    var rt = DS.ratingOf(p);
    var st = DS.starsOf(p);
    var skills = '';
    if (p.skill) { skills += '<span class="sk">' + esc(p.skill) + '</span>'; }
    if (p.trained && p.trained.length) {
      var i;
      for (i = 0; i < p.trained.length && i < 3; i++) { skills += '<span class="sk">' + esc(p.trained[i]) + '</span>'; }
    }
    var body =
      '<div class="pd-head" data-pos="' + p.pos + '">' +
      '<div class="pd-port">' + figTag(p, 'pd-fig', 4, { number: true }) +
      '<div class="pd-rare" style="--rc:' + rarityColor(p) + '">Rare <i>' + rareStars(DS.RARITY[p.rarity].stars) + '</i></div></div>' +
      '<div class="pd-info">' +
      '<div class="pd-topline"><span class="pos" style="--pc:' + posColor(p) + '">' + p.pos + '</span><span>' + p.tenure + '기수</span><span>Rt. ' + rt + '</span></div>' +
      '<div class="pd-nick">\'' + esc(p.nickname) + '\'</div>' +
      '<div class="pd-name">' + esc(p.name) + ' <small>' + p.age + '세</small></div>' +
      '<div class="pd-rows">' +
      '<div><span>타입</span><b>' + esc(p.playType) + '</b></div>' +
      '<div><span>신장</span><b>' + p.height + 'cm / ' + p.weight + 'kg</b></div>' +
      '<div><span>개성</span><b>' + tr.name + ' ' + tr.val + '</b></div>' +
      '</div></div></div>' +
      '<div class="band">STATUS DATA <span>능력치 · 적성</span></div>' +
      '<div class="pd-status">' +
      '<div class="apt-grid">' + aptCells(p) + '</div>' +
      '<div class="st-list">' +
      statRow('스피드', p.s, 's') + statRow('테크닉', p.t, 't') +
      statRow('파워', p.p, 'p') + statRow('개성', tr.val, 'tr') +
      '</div>' +
      '<div class="tend-wrap"><canvas data-tend="' + p.id + '" width="86" height="80"></canvas>' +
      '<div class="tend-cap">지성·조직·감성·개인</div></div>' +
      '</div>' +
      '<div class="band">SET PIECE <span>PK / FK / CK / Cap.</span></div>' +
      '<div class="st-list" style="margin-top:2px">' +
      statRow('PK', p.set.pk, 'set') + statRow('FK', p.set.fk, 'set') +
      statRow('CK', p.set.ck, 'set') + statRow('Cap.', p.set.cap, 'set') +
      statRow('터프', p.tough, 'etc') + statRow('스태미나', p.stamina, 'etc') + statRow('인기', p.fame, 'etc') +
      '</div>' +
      '<div class="band">PLAYER DETAIL <span>' + esc(p.nickname) + '</span></div>' +
      '<div class="pd-story">' + skills + DS.storyFor(p, S.club.name) + '</div>' +
      (inSquad ?
        '<div class="pd-edit">' +
        '<label>이름 <input id="pd-name" maxlength="8" value="' + esc(p.name) + '"></label>' +
        '<label>등번호 <input id="pd-num" type="number" min="1" max="99" value="' + p.number + '"></label>' +
        '<button class="btn primary" data-act="saveplayer" data-id="' + p.id + '">이름 · 등번호 저장</button>' +
        '</div>' :
        '<div class="empty-note">스카우트 후보 선수입니다. 영입하면 이름과 등번호를 바꿀 수 있어요.</div>');
    setSheet('PLAYER DETAIL', body);
    paintAll(document.getElementById('modal'));
  }

  /* ───────── 역할 지정 (CAP / FK / CK / PK) ───────── */
  function roleModal() {
    var st = starters();
    var rows = '', i;
    var defs = [
      { k: 'cap', tag: 'CAP', name: '주장', desc: '통솔 + 경기 집중력' },
      { k: 'fk', tag: 'FK', name: '프리킥', desc: '직접 프리킥 담당' },
      { k: 'ck', tag: 'CK', name: '코너킥', desc: '코너킥 담당' },
      { k: 'pk', tag: 'PK', name: '페널티킥', desc: 'PK 키커' }
    ];
    for (i = 0; i < defs.length; i++) {
      var d = defs[i];
      var cur = byId(S.roles[d.k]);
      rows += '<div class="role-row">' +
        '<span class="role-tag ' + (d.k === 'cap' ? '' : d.k) + '">' + d.tag + '</span>' +
        '<div class="role-main"><b>' + (cur ? esc(cur.name) : '미지정') + '</b><small>' + d.name + ' · ' + d.desc + '</small></div>' +
        '<button class="btn ghost sm" data-act="roleopen" data-k="' + d.k + '">변경</button>' +
        '</div>';
      if (rolePick === d.k) {
        var picks = '';
        for (var j = 0; j < st.length; j++) {
          picks += '<button class="' + (S.roles[d.k] === st[j].id ? 'on' : '') + '" data-act="roleset" data-k="' + d.k + '" data-id="' + st[j].id + '">' +
            st[j].pos + ' ' + esc(shortName(st[j].name)) + '</button>';
        }
        rows += '<div class="role-pick">' + picks + '</div>';
      }
    }
    setSheet('역할 선택 · CAP / FK / CK / PK',
      '<div class="muted tiny" style="margin-bottom:4px">선발 11명 중에서 역할을 지정합니다. 주장은 통솔이, 키커는 세트피스 능력이 반영됩니다.</div>' +
      rows +
      '<button class="btn navy wide" style="margin-top:8px" data-act="autorole">능력치 기준 자동 지정</button>');
  }

  /* ───────── 스카우트 IN / OUT ───────── */
  function scoutModal(cand) {
    ioState.candId = cand.id;
    var outList = '', i, p;
    var list = S.squad.slice().sort(function (a, b) { return DS.ratingOf(a) - DS.ratingOf(b); });
    for (i = 0; i < list.length; i++) {
      p = list[i];
      outList += '<button class="out-item' + (ioState.outId === p.id ? ' on' : '') + '" data-act="outpick" data-id="' + p.id + '">' +
        '<span class="op" style="--pc:' + posColor(p) + '">' + p.pos + '</span>' +
        '<span>' + esc(p.name) + '</span><span class="or">Rt.' + DS.ratingOf(p) + '</span></button>';
    }
    var outP = ioState.outId ? byId(ioState.outId) : null;
    var body =
      '<div class="io-row">' +
      '<div class="io-stamp in">획득<small>IN</small></div>' +
      '<div class="io-text" style="flex:1 1 auto">' + esc(cand.name) + '<br><span class="muted tiny">' + cand.pos + ' · Rt.' + DS.ratingOf(cand) + ' · ' + DS.RARITY[cand.rarity].name + '</span></div>' +
      '<div class="io-stamp out">방출<small>OUT</small></div>' +
      '</div>' +
      '<div class="io-text" style="margin-bottom:5px">' +
      (outP ? '<b>' + esc(outP.name) + '</b> 선수를 방출하고<br><b>' + esc(cand.name) + '</b> 선수를 영입합니다.' : '방출할 선수를 아래에서 선택해 주세요.') +
      '</div>' +
      '<div class="row-between" style="margin-bottom:4px"><span class="muted tiny">방출 선수 선택 (선수단 ' + S.squad.length + '/' + MAX_SQUAD + ')</span>' +
      '<span class="chip">🪙' + fmt(CAND_COST) + '</span></div>' +
      '<div class="out-list">' + outList + '</div>' +
      '<div class="row-between" style="margin-top:8px">' +
      '<button class="btn ghost" data-act="closemodal">돌아가기</button>' +
      '<button class="btn red" data-act="scoutconfirm" ' + (!outP || S.money < CAND_COST ? 'disabled' : '') + '>선수 영입</button>' +
      '</div>';
    setSheet('스페셜 스카우트 · IN / OUT', body);
    paintAll(document.getElementById('modal'));
  }

  /* ───────── 결과서 (RESULTS) ───────── */
  function reportHTML(r) {
    var i, home = r.homeScore, away = r.awayScore;
    var goals = '', caut = '', pts = '', car = '';
    if (!r.goals.length) { goals = '<div class="rline empty">득점 없음</div>'; }
    for (i = 0; i < r.goals.length; i++) {
      var g = r.goals[i];
      goals += '<div class="rline ' + (g.side === 'away' ? 'away' : '') + '">' +
        (g.side === 'away' ? '' : '<span class="ic">⚽</span>') +
        '<b>' + esc(g.name) + '</b><span class="min">' + (g.half === 1 ? '후' : '전') + '반 ' + g.min + '분</span>' +
        (g.assist ? '<span class="min">도움 ' + esc(g.assist) + '</span>' : '') +
        (g.side === 'away' ? '<span class="ic">⚽</span>' : '') +
        '</div>';
    }
    if (!r.cautions.length) { caut = '<div class="rline empty">경고 없음</div>'; }
    for (i = 0; i < r.cautions.length; i++) {
      var c = r.cautions[i];
      caut += '<div class="rline ' + (c.side === 'away' ? 'away' : '') + '">' +
        (c.side === 'away' ? '' : '<span class="ic">🟨</span>') +
        '<b>' + esc(c.name) + '</b><span class="min">' + (c.half === 1 ? '후' : '전') + '반 ' + c.min + '분</span>' +
        (c.side === 'away' ? '<span class="ic">🟨</span>' : '') +
        '</div>';
    }
    var sorted = r.ratings.slice();
    var half = sorted.slice(0, 6), half2 = sorted.slice(6);
    pts += '<div class="pcard-pts">';
    pts += '<div>' + ptsColumn(half) + '</div><div>' + ptsColumn(half2) + '</div>';
    pts += '</div>';

    var rows = S.career.slice();
    rows.push({
      season: S.season, rank: ourRank(), p: tableRow('me').p, w: tableRow('me').w,
      d: tableRow('me').d, l: tableRow('me').l, gf: tableRow('me').gf, ga: tableRow('me').ga, pts: tableRow('me').pts, now: true
    });
    for (i = 0; i < rows.length; i++) {
      var cr = rows[i];
      car += '<tr class="' + (cr.now ? 'now' : '') + '"><td>' + cr.season + '</td><td class="ch">' + cr.rank + '위</td>' +
        '<td>' + cr.p + '</td><td>' + cr.w + '</td><td>' + cr.d + '</td><td>' + cr.l + '</td>' +
        '<td>' + cr.gf + ':' + cr.ga + '</td><td>' + cr.pts + '</td></tr>';
    }

    return '<div class="report-head"><b>RESULTS</b><span style="font-size:10px">' + r.season + ' 시즌 · ' + r.roundLabel + '</span></div>' +
      '<div class="report-info">' +
      '<div><span>대회</span><b>' + esc(r.competition) + '</b></div>' +
      '<div><span>일시</span><b>' + r.date + '</b></div>' +
      '<div><span>장소</span><b>' + esc(r.stadium) + '</b></div>' +
      '<div><span>관중</span><b>' + fmt(r.attendance) + '명</b></div>' +
      '</div>' +
      '<div class="report-score">' +
      '<div class="rs-team"><span class="rs-tag h">HOME</span>' +
      '<canvas data-emblem="' + r.homeEmblem + '" data-kit="' + r.homeKit.shirt + '|' + r.homeKit.trim + '" width="36" height="40"></canvas>' +
      '<b>' + esc(r.homeName) + '</b></div>' +
      '<div class="rs-score"><div><b>' + home + '</b><em>:</em><b>' + away + '</b></div>' +
      '<div class="half-table"><table><tr><th></th><th>전반</th><th>후반</th></tr>' +
      '<tr><td style="font-size:7px">' + esc(r.homeShort) + '</td><td>' + r.half[0][0] + '</td><td>' + r.half[1][0] + '</td></tr>' +
      '<tr><td style="font-size:7px">' + esc(r.awayShort) + '</td><td>' + r.half[0][1] + '</td><td>' + r.half[1][1] + '</td></tr></table></div></div>' +
      '<div class="rs-team"><span class="rs-tag a">AWAY</span>' +
      '<canvas data-emblem="' + r.awayEmblem + '" data-kit="' + r.awayKit.shirt + '|' + r.awayKit.trim + '" width="36" height="40"></canvas>' +
      '<b>' + esc(r.awayName) + '</b></div>' +
      '</div>' +
      '<div class="sheet-body">' +
      '<div class="rpanel"><div class="rpanel-head">GOALS</div><div class="rpanel-body">' + goals + '</div></div>' +
      '<div class="rpanel"><div class="rpanel-head">CAUTIONS</div><div class="rpanel-body">' + caut + '</div></div>' +
      '<div class="rpanel"><div class="rpanel-head">STARTING MEMBER · Pts.</div><div class="rpanel-body">' + pts + '</div></div>' +
      '<div class="rpanel"><div class="rpanel-head">MATCH STATS</div><div class="rpanel-body">' +
      '<div class="rline"><span>슛</span><b>' + r.shots.home + ' : ' + r.shots.away + '</b><span style="margin-left:auto">패스 ' + r.passes + '</span></div>' +
      '<div class="rline"><span>점유율</span><b>' + r.possession[0] + '% : ' + r.possession[1] + '%</b><span style="margin-left:auto">태클 ' + r.tackles + ' · 선방 ' + r.saves + '</span></div>' +
      '<div class="rline"><span>MVP</span><b>' + esc(r.mvp.name) + '</b><span style="margin-left:auto">평점 ' + r.mvpRating.toFixed(1) + '</span></div>' +
      '</div></div>' +
      '<div class="rpanel"><div class="rpanel-head">리그 통산 성적</div><div class="rpanel-body">' +
      '<table class="career-table"><thead><tr><th>시즌</th><th>순위</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead>' +
      '<tbody>' + car + '</tbody></table></div></div>' +
      '<div class="row-between" style="margin-top:6px"><span class="muted tiny">보상 🪙' + fmt(r.reward) + (r.points ? ' · 승점 +' + r.points : '') + '</span>' +
      '<button class="btn primary" data-act="closemodal">확인</button></div>' +
      '</div>';
  }

  function ptsColumn(list) {
    var s = '', i, r;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      s += '<div class="pts-row' + (r.mvp ? ' mvp' : '') + '">' +
        '<span class="pt">' + r.rating.toFixed(0) + '</span>' +
        '<span class="nm">' + esc(r.name) + (r.goals ? ' ⚽' + r.goals : '') + '</span>' +
        '<span class="rl" style="--pc:' + (DS.POS[r.pos] ? DS.POS[r.pos].color : '#888') + '">' + r.role + '</span>' +
        '<span class="pt">' + (r.mvp ? '👑' : '') + '</span></div>';
    }
    return s;
  }

  function showReport(r) {
    var m = document.getElementById('modal');
    m.className = 'on report';
    m.innerHTML = '<div class="sheet" style="border-color:#8a6610">' + reportHTML(r) + '</div>';
    paintAll(m);
  }

  /* ═════════════════════════  동작  ═════════════════════════ */
  function doFormation(f) {
    if (!DS.FORMATIONS[f]) { return; }
    S.formation = f;
    S.lineup = autoLineup(S.squad, f);
    selId = null;
    autoRoles();
    save();
    renderAll();
    toast(f + ' 포메이션 적용 · ☆ 핵심 자리 보너스');
  }

  function swapSlot(benchId, slot) {
    var cur = S.lineup[slot];
    var benchIdx = -1, i;
    for (i = 0; i < S.bench.length; i++) { if (S.bench[i] === benchId) { benchIdx = i; } }
    var lineIdx = -1;
    for (i = 0; i < S.lineup.length; i++) { if (S.lineup[i] === benchId) { lineIdx = i; } }
    if (lineIdx >= 0) {
      S.lineup[lineIdx] = cur;
      S.lineup[slot] = benchId;
    } else if (benchIdx >= 0) {
      S.bench[benchIdx] = cur;
      S.lineup[slot] = benchId;
    } else {
      S.lineup[slot] = benchId;
    }
    selId = null;
    autoRoles();
    save();
    renderAll();
    toast('자리를 바꿨습니다.');
  }

  function doFacility(key) {
    var fac = DS.facilityOf(key);
    if (!fac) { return; }
    var lv = S.facilities[key] || 0;
    if (lv >= 5) { toast('이미 최고 레벨입니다.'); return; }
    var cost = DS.facilityCost(fac, lv);
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    S.money -= cost;
    S.facilities[key] = lv + 1;
    if (key === 'cafe') { S.morale = clamp(S.morale + 3, 0, 100); }
    save();
    renderAll();
    toast(fac.name + ' Lv.' + (lv + 1) + (lv === 0 ? ' 건설 완료!' : ' 업그레이드!'));
  }

  function doTrain() {
    var p = byId(trainSel.playerId);
    if (!p || trainSel.menus.length !== 2) { toast('선수와 훈련 2개를 선택하세요.'); return; }
    var cost = 300 + p.level * 120;
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    S.money -= cost;
    p.level++;
    var gain = { s: 0, t: 0, p: 0, cap: 0, fk: 0, ck: 0 };
    var i, m, k;
    for (i = 0; i < 2; i++) {
      m = DS.trainMenuOf(trainSel.menus[i]);
      for (k in m.gain) { if (m.gain.hasOwnProperty(k)) { gain[k] += m.gain[k]; } }
    }
    var combo = DS.findCombo(trainSel.menus[0], trainSel.menus[1]);
    if (combo) {
      for (k in combo.gain) { if (combo.gain.hasOwnProperty(k)) { gain[k] += combo.gain[k]; } }
      p.skill = combo.skill;
      if (S.combos.indexOf(combo.skill) < 0) { S.combos.push(combo.skill); }
      if (p.trained.indexOf(combo.name) < 0) { p.trained.push(combo.name); }
    }
    /* 훈련 시설 보너스 */
    var bonus = facValue('training');
    if (bonus > 0 && chance(bonus / 100)) {
      var keys = ['s', 't', 'p'];
      gain[pick(keys)] += 1;
    }
    p.s = clamp(p.s + gain.s, 1, 10);
    p.t = clamp(p.t + gain.t, 1, 10);
    p.p = clamp(p.p + gain.p, 1, 10);
    p.set.cap = clamp(p.set.cap + gain.cap, 1, 10);
    p.set.fk = clamp(p.set.fk + gain.fk, 1, 10);
    p.set.ck = clamp(p.set.ck + gain.ck, 1, 10);
    p.stats = DS.statSheet(p);
    trainSel.menus = [];
    save();
    renderAll();
    toast(combo ? '🔥 특훈 콤보 ' + combo.name + '! ' + p.name + ' 각성' : p.name + ' 특훈 완료 (Lv.' + p.level + ')');
  }

  function doScoutNormal() {
    if (S.money < 600) { toast('금화가 부족합니다.'); return; }
    if (S.squad.length >= MAX_SQUAD) { toast('선수단이 가득 찼습니다. IN/OUT으로 교환하세요.'); return; }
    S.money -= 600;
    var p = DS.makePlayer({ rarity: DS.pickRarity('normal') });
    S.squad.push(p);
    S.dex.players[p.name] = 1;
    S.bench = autoBench(S.squad, S.lineup);
    save();
    renderAll();
    toast(DS.RARITY[p.rarity].name + ' 등급 ' + p.name + ' 영입!');
  }

  function doScoutConfirm() {
    var cand = findAny(ioState.candId);
    var outP = byId(ioState.outId);
    if (!cand || !outP) { toast('방출할 선수를 선택하세요.'); return; }
    if (S.money < CAND_COST) { toast('금화가 부족합니다.'); return; }
    S.money -= CAND_COST;
    /* 방출 처리 */
    var li = S.lineup.indexOf(outP.id);
    var bi = S.bench.indexOf(outP.id);
    if (li >= 0) { S.lineup[li] = cand.id; }
    if (bi >= 0) { S.bench[bi] = cand.id; }
    S.squad = S.squad.filter(function (x) { return x.id !== outP.id; });
    S.squad.push(cand);
    delete EXTRA[cand.id];
    S.dex.players[cand.name] = 1;
    if (S.roles.cap === outP.id || S.roles.fk === outP.id || S.roles.ck === outP.id || S.roles.pk === outP.id) { autoRoles(); }
    S.scoutCandidates = S.scoutCandidates.filter(function (x) { return x.id !== cand.id; });
    save();
    closeModal();
    renderAll();
    toast('IN ' + cand.name + ' / OUT ' + outP.name + ' 교환 완료!');
  }

  /* ───────── 경기 ───────── */
  function buildAwaySquad(team) {
    var out = [], i;
    var roles = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
    for (i = 0; i < 11; i++) {
      var p = DS.makePlayer({ pos: roles[i], rarity: 'eun' });
      var target = team.strength + U.irange(-5, 5);
      var sc = target / Math.max(30, DS.ratingOf(p));
      p.s = clamp(Math.round(p.s * sc * 1.05), 1, 10);
      p.t = clamp(Math.round(p.t * sc * 1.05), 1, 10);
      p.p = clamp(Math.round(p.p * sc * 1.05), 1, 10);
      p.stats = DS.statSheet(p);
      out.push(p);
    }
    return out;
  }

  function startMatch(kind, opt) {
    opt = opt || {};
    var oppTeam = null, oppId = null, i;
    if (kind === 'smatch') {
      oppId = opt.teamId;
      oppTeam = opponentTeam(oppId);
      if (S.smatchTickets <= 0) { toast('S매치 이용권이 없습니다.'); return; }
      S.smatchTickets--;
    } else if (kind === 'challenge') {
      if (S.challengeLeft <= 0) { toast('오늘 챌린지를 모두 소진했습니다.'); return; }
      oppTeam = DS.TEAMS[0];
      for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].strength > oppTeam.strength) { oppTeam = DS.TEAMS[i]; } }
      oppId = oppTeam.id;
    } else {
      var o = currentOpponent();
      if (!o) { toast('이번 시즌 일정이 끝났습니다.'); return; }
      oppTeam = opponentTeam(o.id);
      oppId = o.id;
    }

    var f = DS.FORMATIONS[S.formation];
    var lineup = [], k, p;
    for (k = 0; k < S.lineup.length; k++) {
      p = byId(S.lineup[k]);
      if (!p) { continue; }
      lineup.push({ player: p, role: f.slots[k].role, pos: f.slots[k].pos, x: f.slots[k].x, y: f.slots[k].y });
    }
    if (lineup.length < 8) { toast('선발 선수가 부족합니다.'); return; }
    if (S.condition < 25) { toast('컨디션이 너무 낮습니다. 회복이 필요합니다.'); return; }

    save();
    setTab('match');
    renderMatchLive(oppTeam, kind);

    var benchList = benchPlayers().map(function (b) {
      return { player: b, pos: b.pos, rating: DS.ratingOf(b) };
    });

    var cfg = {
      homeName: S.club.name,
      awayName: oppTeam.name,
      homeShort: S.club.name.length > 4 ? S.club.name.slice(0, 4) : S.club.name,
      awayShort: oppTeam.short,
      homeKit: S.club.kit,
      awayKit: oppTeam.kit,
      homeEmblem: S.club.emblem,
      awayEmblem: oppTeam.emblem,
      lineup: lineup,
      bench: benchList,
      awayPlayers: buildAwaySquad(oppTeam),
      tactics: S.tactics,
      condition: S.condition,
      roles: S.roles,
      kind: kind,
      onHalftime: function () { openSubs(true); },
      onEnd: function (res) { finishMatch(res, oppTeam, oppId, kind); }
    };
    global.setTimeout(function () { if (DS.Match) { DS.Match.start(cfg); } }, 50);
  }

  function finishMatch(res, oppTeam, oppId, kind) {
    var gf = res.homeScore, ga = res.awayScore;
    var win = gf > ga, draw = gf === ga;
    var base = win ? (420 + gf * 60 + (gf - ga) * 40) : (draw ? 210 : 110 + gf * 30);
    if (kind === 'challenge') { base = Math.round(base * 2); }
    if (kind === 'smatch') { base = Math.round(base * 1.35); }
    var spBonus = 0, sp;
    var i;
    for (i = 0; i < DS.SPONSORS.length; i++) {
      if (DS.SPONSORS[i].id === S.sponsor && S.fans >= DS.SPONSORS[i].fans) { sp = DS.SPONSORS[i]; spBonus = sp.bonus; }
    }
    var shopBonus = facValue('shop');
    var reward = base + spBonus + shopBonus;
    if (kind === 'smatch' && S.smatchStreak >= 3) { reward = Math.round(reward * 1.25); }

    var fanGain = win ? U.irange(40, 90) : (draw ? U.irange(10, 30) : -U.irange(10, 30));
    if (win) { fanGain = Math.round(fanGain * (1 + facValue('fanclub') / 100)); }
    S.fans = Math.max(120, S.fans + fanGain);
    S.morale = clamp(S.morale + (win ? 6 : (draw ? 0 : -5)), 0, 100);
    S.condition = clamp(S.condition - U.irange(10, 16) + facValue('medical'), 5, 100);
    S.money += reward;
    S.totals.matches++;
    S.totals.goals += gf;
    S.totals.conceded += ga;
    if (win) { S.totals.wins++; } else if (draw) { S.totals.draws++; } else { S.totals.losses++; }

    var points = null;
    if (kind === 'league') {
      playMatchRows(gf, ga, oppId);
      S.round++;
      points = win ? 3 : (draw ? 1 : 0);
      if (S.round >= S.fixtures.length) { S.seasonOver = true; }
    } else if (kind === 'challenge') {
      S.challengeLeft = Math.max(0, S.challengeLeft - 1);
    } else if (kind === 'smatch') {
      S.smatchStreak = win ? S.smatchStreak + 1 : 0;
    }

    var stadiums = ['도트 파크', '올리브 스타디움', '한강 경기장', '벽산 아레나'];
    var report = {
      season: S.season,
      roundLabel: kind === 'league' ? ((S.round) + '라운드') : (kind === 'smatch' ? 'S매치' : '챌린지'),
      competition: kind === 'league' ? '도트 리그' : (kind === 'smatch' ? 'S매치 스페셜' : '챌린지 매치'),
      date: '2045/11/' + (14 + (S.round % 12)) + ' ' + ['19:30', '20:00', '21:00'][S.round % 3],
      stadium: stadiums[S.round % stadiums.length],
      attendance: 380 + Math.floor(S.fans / 12),
      homeName: S.club.name,
      awayName: oppTeam.name,
      homeShort: S.club.name.length > 4 ? S.club.name.slice(0, 4) : S.club.name,
      awayShort: oppTeam.short,
      homeEmblem: S.club.emblem,
      awayEmblem: oppTeam.emblem,
      homeKit: S.club.kit,
      awayKit: oppTeam.kit,
      homeScore: gf, awayScore: ga,
      half: res.half,
      goals: res.goals,
      cautions: res.cautions,
      ratings: res.ratings,
      mvp: res.mvp || { name: '-' },
      mvpRating: res.mvpRating || 6,
      shots: res.shots,
      passes: res.passes,
      tackles: res.tackles,
      saves: res.saves,
      possession: res.possession,
      reward: reward,
      points: points,
      kind: kind
    };

    S.lastReport = report;
    S.lastResult = {
      homeName: S.club.name, awayName: oppTeam.name, gf: gf, ga: ga,
      mvp: report.mvp.name, mvpRating: report.mvpRating, reward: reward
    };
    if (S.log.length > 20) { S.log.shift(); }
    S.log.push('S' + S.season + ' ' + report.roundLabel + ' ' + oppTeam.short + ' ' + gf + ':' + ga);

    save();
    renderHeader();
    global.setTimeout(function () { showReport(report); }, 350);
  }

  function newSeason() {
    var rank = ourRank();
    var prize = rank === 1 ? 3000 : (rank === 2 ? 2000 : (rank === 3 ? 1400 : 800));
    var me = tableRow('me');
    S.career.push({
      season: S.season, rank: rank, p: me.p, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts
    });
    S.money += prize;
    S.season++;
    S.seasonOver = false;
    S.round = 0;
    S.table = makeTable();
    S.fixtures = makeFixtures();
    S.challengeLeft = 1;
    S.smatchTickets = 3;
    S.smatchStreak = 0;
    S.fans += 120;
    S.morale = clamp(S.morale + 4, 0, 100);
    S.condition = clamp(S.condition + 20, 0, 100);
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { DS.TEAMS[i].strength = clamp(DS.TEAMS[i].strength + 1, 55, 92); }
    save();
    toast('시즌 ' + S.season + ' 시작! 우승 상금 🪙' + fmt(prize));
    renderAll();
  }

  /* ───────── 경기 화면 ───────── */
  function renderMatchIdle() {
    var box = document.getElementById('screen-match');
    if (!box) { return; }
    if (DS.Match && DS.Match.running) { return; }
    var next = currentOpponent();
    var html = '';
    if (S.seasonOver) {
      html += '<div class="card"><div class="card-title">🏟️ 도트 경기장</div><div class="muted">이번 시즌 일정이 모두 끝났습니다. 공식전 탭에서 새 시즌을 시작하세요.</div></div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      html += '<div class="card"><div class="card-title">🏟️ 도트 경기장 <span class="muted">' + (S.round + 1) + '라운드</span></div>' +
        '<div class="vsrow">' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="44" height="50"></canvas><span>' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + esc(opp.name) + '</span></div>' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="44" height="50"></canvas><span>' + esc(opp.short) + '</span></div>' +
        '</div>' +
        '<button class="btn primary wide" data-act="kickoff">킥오프!</button></div>';
    }
    html += '<div class="card"><div class="card-title">조작 안내</div><ul class="guide-list">' +
      '<li><b>배속</b> ×1 / ×2 / ×3 으로 경기 속도 조절</li>' +
      '<li><b>전술</b> 공격적 · 균형 · 수비적으로 실시간 지시</li>' +
      '<li><b>교체</b> 벤치 5명을 실시간·하프타임에 투입 (최대 5회)</li>' +
      '<li>경기 종료 후 <b>RESULTS</b> 결과서에서 골·경고·평점·통산 성적을 확인</li></ul></div>' +
      '<div class="card staff-card"><canvas data-staff="coach"></canvas><div class="speech"><b>감독</b> — 경기는 90분, 집중력이 전부다. 하프타임에 숨을 고르고 후반을 준비하게.</div></div>';
    box.innerHTML = html;
    paintAll(box);
  }

  function renderMatchLive(oppTeam, kind) {
    var box = document.getElementById('screen-match');
    box.innerHTML =
      '<div class="scoreboard">' +
      '<div class="sb-team home"><canvas class="sb-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="26" height="30"></canvas><span class="sb-name">' + esc(S.club.name) + '</span></div>' +
      '<div class="sb-score"><b id="m-gf">0</b><i>:</i><b id="m-ga">0</b><span id="m-clock">00\'</span></div>' +
      '<div class="sb-team away"><canvas class="sb-emblem" data-emblem="' + oppTeam.emblem + '" data-kit="' + oppTeam.kit.shirt + '|' + oppTeam.kit.trim + '" width="26" height="30"></canvas><span class="sb-name">' + esc(oppTeam.short) + '</span></div>' +
      (kind !== 'league' ? '<div class="sb-badge">' + (kind === 'smatch' ? 'S매치' : '챌린지') + '</div>' : '') +
      '</div>' +
      '<div class="pitch-wrap"><canvas id="m-pitch"></canvas><div id="m-banner" class="goal-banner"></div></div>' +
      '<div class="commentary" id="m-comm"><div class="cmt-head"><span class="mic">🎙️</span><b>중계</b><span style="margin-left:auto;font-size:8px">도트싸커 중계석</span></div><div class="cmt-body" id="m-comm-body"></div></div>' +
      '<div class="match-ctrl">' +
      '<div class="ctrl-group"><span class="ctrl-label">배속</span><div class="seg" id="m-speeds">' +
      '<button data-act="speed" data-v="1" class="on">×1</button><button data-act="speed" data-v="2">×2</button><button data-act="speed" data-v="3">×3</button>' +
      '</div></div>' +
      '<div class="ctrl-group"><span class="ctrl-label">전술</span><div class="seg tactics" id="m-tactics">' +
      '<button data-act="tactics" data-v="attack" class="' + (S.tactics === 'attack' ? 'on' : '') + '">공격</button>' +
      '<button data-act="tactics" data-v="balanced" class="' + (S.tactics === 'balanced' ? 'on' : '') + '">균형</button>' +
      '<button data-act="tactics" data-v="defense" class="' + (S.tactics === 'defense' ? 'on' : '') + '">수비</button>' +
      '</div></div>' +
      '<div class="ctrl-group sub"><button class="btn sm" data-act="subs">교체</button></div>' +
      '</div>' +
      '<div class="match-overlay" id="m-overlay"></div>';
    paintEmblems(box);
  }

  /* ───────── 선수 교체 ───────── */
  var subHalf = false;
  function openSubs(halftime) {
    subHalf = !!halftime;
    var st = DS.Match && DS.Match.subState ? DS.Match.subState() : null;
    if (!st) { return; }
    var ov = document.getElementById('m-overlay');
    if (!ov) { return; }
    var outHTML = '', inHTML = '', i, it;
    for (i = 0; i < st.onPitch.length; i++) {
      it = st.onPitch[i];
      outHTML += '<button class="sub-item' + (subState.outId === it.id ? ' on' : '') + (it.off ? ' off' : '') + '" data-act="subpick" data-side="out" data-id="' + it.id + '" ' + (it.off ? 'disabled' : '') + '>' +
        '<span class="sp" style="--pc:' + (DS.POS[it.pos] ? DS.POS[it.pos].color : '#888') + '">' + it.role + '</span>' +
        '<span class="sn">' + esc(it.name) + '</span><span class="sr">' + it.rating + '</span></button>';
    }
    for (i = 0; i < st.bench.length; i++) {
      it = st.bench[i];
      inHTML += '<button class="sub-item' + (subState.inId === it.id ? ' on' : '') + (it.used ? ' off' : '') + '" data-act="subpick" data-side="in" data-id="' + it.id + '" ' + (it.used ? 'disabled' : '') + '>' +
        '<span class="sp" style="--pc:' + (DS.POS[it.pos] ? DS.POS[it.pos].color : '#888') + '">' + it.pos + '</span>' +
        '<span class="sn">' + esc(it.name) + '</span><span class="sr">' + it.rating + '</span></button>';
    }
    ov.innerHTML = '<div class="sub-panel">' +
      '<div class="sub-head"><b>선수 교체</b><span>남은 교체 ' + st.subsLeft + '회' + (halftime ? ' · 하프타임' : '') + '</span></div>' +
      '<div class="sub-min">현재 ' + st.minute + '분 · 스코어 ' + st.score + '</div>' +
      '<div class="sub-cols">' +
      '<div><div class="sub-title">OUT · 선발</div><div class="sub-list">' + outHTML + '</div></div>' +
      '<div><div class="sub-title">IN · 벤치</div><div class="sub-list">' + inHTML + '</div></div>' +
      '</div>' +
      '<div class="sub-btns">' +
      '<button class="btn ghost" data-act="subclose">' + (halftime ? '그대로 후반' : '닫기') + '</button>' +
      '<button class="btn primary" data-act="subconfirm" ' + (!subState.inId || !subState.outId ? 'disabled' : '') + '>투입</button>' +
      '</div>' +
      (halftime ? '<button class="btn navy wide" style="margin-top:4px" data-act="halftime2">후반 시작</button>' : '') +
      '</div>';
    ov.classList.add('on');
  }
  function closeSubs() {
    var ov = document.getElementById('m-overlay');
    if (ov) { ov.classList.remove('on'); }
    subState.inId = null; subState.outId = null;
  }

  /* ─────────────────────────  탭 · 렌더  ───────────────────────── */
  var TABS = ['official', 'smatch', 'myteam', 'club', 'shop'];

  function setTab(tab) {
    var sec = document.getElementById('screen-' + tab);
    if (!sec) { return; }
    currentTab = tab;
    var i, secs = document.querySelectorAll('.screen'), btns = document.querySelectorAll('.tabbar button');
    for (i = 0; i < secs.length; i++) { secs[i].classList.toggle('on', secs[i].id === 'screen-' + tab); }
    var activeTab = tab === 'match' ? 'official' : tab;
    for (i = 0; i < btns.length; i++) { btns[i].classList.toggle('on', btns[i].getAttribute('data-tab') === activeTab); }
    renderAll();
  }

  function renderAll() {
    renderHeader();
    if (currentTab === 'official') { renderOfficial(); }
    else if (currentTab === 'smatch') { renderSmatch(); }
    else if (currentTab === 'myteam') { renderMyteam(); }
    else if (currentTab === 'club') { renderClub(); }
    else if (currentTab === 'shop') { renderShop(); }
    else if (currentTab === 'match') { renderMatchIdle(); }
  }

  /* ─────────────────────────  이벤트  ───────────────────────── */
  function onAction(act, t) {
    var id, v, f;
    if (!act) { return; }

    if (act === 'closemodal') { closeModal(); return; }
    if (act === 'tab') { closeModal(); setTab(t.getAttribute('data-tab')); return; }

    if (act === 'player') { id = t.getAttribute('data-id'); var pp = findAny(id); if (pp) { playerModal(pp); } return; }
    if (act === 'backup') { id = t.getAttribute('data-id'); if (selId) { swapSlot(id, findBestSlotFor(id)); return; } var bp = byId(id); if (bp) { playerModal(bp); } return; }

    if (act === 'formation') { doFormation(t.getAttribute('data-f')); return; }
    if (act === 'autolineup') { S.lineup = autoLineup(S.squad, S.formation); S.bench = autoBench(S.squad, S.lineup); autoRoles(); selId = null; save(); renderAll(); toast('최적 라인업으로 자동 배치했습니다.'); return; }

    if (act === 'bench') {
      id = t.getAttribute('data-id');
      if (selId === id) { selId = null; renderMyteam(); return; }
      if (selId) { selId = id; renderMyteam(); toast('피치에서 바꿀 선수를 선택하세요.'); return; }
      selId = id; renderMyteam(); toast('피치에서 바꿀 선발을 선택하세요.'); return;
    }
    if (act === 'starter') {
      var slot = parseInt(t.getAttribute('data-slot'), 10);
      id = t.getAttribute('data-id');
      if (selId) { swapSlot(selId, slot); return; }
      if (!id) { toast('빈 자리입니다. 벤치 선수를 먼저 선택하세요.'); return; }
      var sp = byId(id); if (sp) { playerModal(sp); } return;
    }

    if (act === 'roleassign') { rolePick = null; roleModal(); return; }
    if (act === 'roleopen') { rolePick = t.getAttribute('data-k'); roleModal(); return; }
    if (act === 'roleset') {
      S.roles[t.getAttribute('data-k')] = t.getAttribute('data-id');
      rolePick = null; save(); renderMyteam(); roleModal(); toast('역할을 지정했습니다.'); return;
    }
    if (act === 'autorole') { autoRoles(); save(); renderMyteam(); roleModal(); toast('능력치 기준으로 역할을 지정했습니다.'); return; }

    if (act === 'facility') { doFacility(t.getAttribute('data-k')); return; }
    if (act === 'trainmenu') {
      var key = t.getAttribute('data-k');
      var idx = trainSel.menus.indexOf(key);
      if (idx >= 0) { trainSel.menus.splice(idx, 1); }
      else if (trainSel.menus.length < 2) { trainSel.menus.push(key); }
      else { trainSel.menus = [trainSel.menus[1], key]; }
      renderClub(); return;
    }
    if (act === 'trainrun') { doTrain(); return; }
    if (act === 'sponsor') {
      var sid = t.getAttribute('data-id');
      var spn = null, i;
      for (i = 0; i < DS.SPONSORS.length; i++) { if (DS.SPONSORS[i].id === sid) { spn = DS.SPONSORS[i]; } }
      if (!spn || S.fans < spn.fans) { toast('팬 수가 부족합니다.'); return; }
      S.sponsor = sid; save(); renderAll(); toast(spn.name + '과 계약했습니다. 경기당 🪙' + fmt(spn.bonus)); return;
    }
    if (act === 'kit') {
      S.club.kit.shirt = t.getAttribute('data-c');
      S.club.kit.trim = DS.Art.shade(S.club.kit.shirt, 80);
      S.dex.kits[S.club.kit.shirt] = 1;
      save(); renderAll(); return;
    }
    if (act === 'shorts') { S.club.kit.shorts = t.getAttribute('data-c'); save(); renderAll(); return; }
    if (act === 'emblem') { S.club.emblem = t.getAttribute('data-e'); S.dex.emblems[S.club.emblem] = 1; save(); renderAll(); return; }
    if (act === 'rename') {
      var inp = document.getElementById('club-name-input');
      if (!inp) { return; }
      var name = (inp.value || '').trim();
      if (name.length < 2) { toast('구단명은 2자 이상이어야 합니다.'); return; }
      S.club.name = name.slice(0, 12);
      save(); renderAll(); toast('구단명 변경 완료'); return;
    }

    if (act === 'saveplayer') {
      var pid = t.getAttribute('data-id'), p = byId(pid);
      if (!p) { return; }
      var ni = document.getElementById('pd-name'), nu = document.getElementById('pd-num');
      if (ni) {
        var nm = (ni.value || '').trim();
        if (nm.length < 2) { toast('이름은 2자 이상이어야 합니다.'); return; }
        delete S.dex.players[p.name];
        p.name = nm.slice(0, 8);
        S.dex.players[p.name] = 1;
      }
      if (nu) {
        var no = parseInt(nu.value, 10);
        if (isNaN(no) || no < 1 || no > 99) { toast('등번호는 1~99 사이입니다.'); return; }
        p.number = no;
      }
      save(); playerModal(p); renderAll(); toast('선수 정보를 저장했습니다.'); return;
    }

    if (act === 'scoutpick') {
      var cand = findAny(t.getAttribute('data-id'));
      if (!cand) { return; }
      ioState = { candId: cand.id, outId: null };
      scoutModal(cand); return;
    }
    if (act === 'outpick') { ioState.outId = t.getAttribute('data-id'); scoutModal(findAny(ioState.candId)); return; }
    if (act === 'scoutconfirm') { doScoutConfirm(); return; }
    if (act === 'reroll') {
      if (S.money < REROLL_COST) { toast('금화가 부족합니다.'); return; }
      S.money -= REROLL_COST; rollScout(); save(); renderAll(); toast('동일 조건으로 리스트를 갱신했습니다.'); return;
    }
    if (act === 'normalScout') { doScoutNormal(); return; }
    if (act === 'item') {
      var kk = t.getAttribute('data-k');
      if (kk === 'drink') { if (S.money < 600) { toast('금화가 부족합니다.'); return; } S.money -= 600; S.condition = clamp(S.condition + 20, 0, 100); save(); renderAll(); toast('컨디션 +20'); }
      else { if (S.money < 900) { toast('금화가 부족합니다.'); return; } S.money -= 900; S.morale = clamp(S.morale + 12, 0, 100); save(); renderAll(); toast('팀 사기 +12'); }
      return;
    }

    if (act === 'kickoff') { startMatch('league'); return; }
    if (act === 'challenge') { startMatch('challenge'); return; }
    if (act === 'smatch') {
      var key2 = t.getAttribute('data-k'), list = smatchList(), i;
      for (i = 0; i < list.length; i++) { if (list[i].key === key2) { startMatch('smatch', { teamId: list[i].team.id }); return; } }
      return;
    }
    if (act === 'smatchticket') {
      if (S.money < 800) { toast('금화가 부족합니다.'); return; }
      S.money -= 800; S.smatchTickets++; save(); renderAll(); toast('S매치 이용권 +1'); return;
    }
    if (act === 'newseason') { newSeason(); return; }
    if (act === 'report') { if (S.lastReport) { showReport(S.lastReport); } return; }

    if (act === 'speed') {
      v = parseInt(t.getAttribute('data-v'), 10);
      if (DS.Match) { DS.Match.setSpeed(v); }
      var sib = document.querySelectorAll('#m-speeds button'), j;
      for (j = 0; j < sib.length; j++) { sib[j].classList.toggle('on', sib[j] === t); }
      return;
    }
    if (act === 'tactics') {
      v = t.getAttribute('data-v');
      S.tactics = v; save();
      if (DS.Match) { DS.Match.setTactics(v); }
      var sib2 = document.querySelectorAll('#m-tactics button');
      for (j = 0; j < sib2.length; j++) { sib2[j].classList.toggle('on', sib2[j] === t); }
      toast(t.textContent + ' 전술로 전환');
      return;
    }
    if (act === 'subs') { openSubs(false); return; }
    if (act === 'subclose') { if (subHalf) { if (DS.Match) { DS.Match.resume(); } subHalf = false; } closeSubs(); return; }
    if (act === 'halftime2') { if (DS.Match) { DS.Match.resume(); } subHalf = false; closeSubs(); return; }
    if (act === 'subpick') {
      var side = t.getAttribute('data-side');
      if (side === 'in') { subState.inId = t.getAttribute('data-id'); }
      else { subState.outId = t.getAttribute('data-id'); }
      openSubs(subHalf); return;
    }
    if (act === 'subconfirm') {
      if (!subState.inId || !subState.outId) { return; }
      var ok = DS.Match ? DS.Match.substitute(subState.inId, subState.outId) : false;
      if (ok) { toast('선수 교체 완료!'); subState.inId = null; subState.outId = null; openSubs(subHalf); }
      else { toast('교체할 수 없습니다.'); }
      return;
    }

    if (act === 'reset') {
      if (global.confirm('정말 처음부터 다시 시작할까요? 저장 데이터가 사라집니다.')) {
        localStorage.removeItem(SAVE_KEY);
        defaultState();
        save();
        setTab('official');
        toast('새 게임을 시작합니다.');
      }
      return;
    }
  }

  function findBestSlotFor(playerId) {
    var p = byId(playerId);
    var f = DS.FORMATIONS[S.formation];
    if (!p) { return 0; }
    var best = 0, score = -999, i;
    for (i = 0; i < f.slots.length; i++) {
      var s = (f.slots[i].pos === p.pos ? 30 : 0) + (p.apt[slotApt(f.slots[i])] || 0);
      if (s > score) { score = s; best = i; }
    }
    return best;
  }

  /* ─────────────────────────  부트  ───────────────────────── */
  function boot() {
    var saved = load();
    if (saved) { S = saved; } else { defaultState(); save(); }
    if (S.squad.length) { var i; for (i = 0; i < S.squad.length; i++) { EXTRA[S.squad[i].id] = S.squad[i]; } }
    renderHeader();
    setTab('official');

    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document && !(t.getAttribute && t.getAttribute('data-act'))) { t = t.parentNode; }
      if (!t || t === document || !t.getAttribute) { return; }
      e.preventDefault();
      onAction(t.getAttribute('data-act'), t);
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id === 'train-player') {
        trainSel.playerId = t.value;
        renderClub();
      }
    });

    global.addEventListener('resize', function () {
      if (currentTab === 'myteam') { drawPitchBG(); placePitchPlayers(); }
      if (DS.Match && DS.Match.running) { DS.Match.resize(); }
    });

    document.addEventListener('visibilitychange', function () { if (document.hidden) { save(); } });
    global.addEventListener('beforeunload', save);
  }

  DS.game = {
    state: function () { return S; },
    save: save,
    setTab: setTab,
    toast: toast,
    playerModal: playerModal,
    showReport: showReport,
    currentTab: function () { return currentTab; },
    renderAll: renderAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);

